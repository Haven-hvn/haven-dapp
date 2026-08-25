/**
 * V4 Arkiv publishing — entity construction + drip upload orchestrator.
 *
 * Each drip chunk becomes ONE Arkiv entity:
 *   - attributes are the filterable surface (`project`, `type`, `gate_*`,
 *     `gate_version="v4"`, `market_cap_target_usd`, `drip_index`,
 *     `published_by`) so `arkiv_query` can filter drips by target or
 *     uploader;
 *   - payload is the v4 gate-metadata JSON every existing reader already
 *     parses, extended with drip-grouping extras (extra keys are ignored by
 *     the frozen SDK guard but survive parsing, giving forward compat).
 *
 * `publishDripStage` runs ONE unlock stage end-to-end: slice -> stream-
 * encrypt -> pin to Filecoin -> IBE-wrap content key -> index in Arkiv.
 * The staged session workflow (`drip-session.ts`) calls it once per market-
 * cap rung, possibly from different wallets/machines; `publishDripChunks`
 * keeps the classic one-sitting whole-drip loop on top of it.
 *
 * @module lib/v4/arkiv-publish
 */

import {
  createWalletClient as createViemWalletClient,
  custom,
  type WalletClient,
} from 'viem'
import { braga } from '@arkiv-network/sdk/chains'
import { createWalletClient as createArkivWalletClient } from '@arkiv-network/sdk'
import { jsonToPayload } from '@arkiv-network/sdk/utils'
import type { Chain as HavenChain } from 'haven-aol'
import { VALID_CHAINS, buildGateMetadataV4 } from 'haven-aol'
import { sha256Hex } from '../crypto'
import { parseAnyGateMetadata } from '../haven-aol/haven-aol-metadata'
import { havenStreamEncrypt, zeroAesKey } from './streaming-encrypt'
import { computeDripDerivationInput, wrapAesKey } from './ibe-wrap'
import { getUploadSynapse, uploadEncryptedPiece } from './synapse-upload'
import type { DripChunkPlan } from './drip-plan'

// ============================================================================
// Entity body (pure — unit tested)
// ============================================================================

/** Publisher-supplied gate configuration shared by every chunk in a drip. */
export interface DripGateConfig {
  /** Haven-AOL chain variant name (see `VALID_CHAINS`). */
  chain: HavenChain
  /** ERC-20 / mint.club token whose market cap gates unlocks. */
  gateToken: string
  /** Token balance a reader must hold to request chunk keys. */
  gateThreshold: number
  /**
   * Bond/oracle contract address backing market-cap resolution.
   * Stored for future on-chain enforcement; unused by the web-only flow.
   */
  oracleAddress: string
  /** Display title applied to every chunk entity. */
  title: string
}

export interface DripEntityBody {
  attributes: Array<{ key: string; value: string | number }>
  payloadJson: Record<string, unknown>
}

/**
 * Build the attribute list + payload JSON for one drip chunk entity.
 *
 * The payload is a NATIVE v4 gate-metadata record (built by the haven-aol
 * SDK's `buildGateMetadataV4`, which pins field order + validation) with
 * additive drip-grouping extras (`dripId`, `dripTotal`) — extra keys are
 * ignored by the frozen SDK guard but survive parsing.
 *
 * Pure and deterministic given its inputs (the caller injects CIDs/hashes),
 * so tests can pin the exact wire shapes without mocks.
 */
export function buildDripEntityBody(args: {
  plan: Pick<DripChunkPlan, 'dripIndex' | 'dripTotal' | 'marketCapTargetUsd'>
  gate: DripGateConfig
  pieceCid: string
  encryptedHash: string
  originalHash: string
  mimeType: string
  encryptedAesKeyB64: string
  /** Stable per-drip identifier grouping all chunks (uuid). */
  dripId: string
  /** Publish epoch — pass once per run so all chunks share it. */
  epoch?: number
  /** Publishing wallet — recorded as a filterable `published_by` attr. */
  publisherAddress?: string
}): DripEntityBody {
  const { plan, gate, pieceCid, encryptedHash, originalHash, mimeType, encryptedAesKeyB64, dripId } =
    args
  const epoch = args.epoch ?? currentDripEpoch()

  const threshold = Math.max(1, Math.floor(gate.gateThreshold))
  const targetUsd = Math.round(plan.marketCapTargetUsd)

  const attributes = [
    { key: 'project', value: 'haven' },
    { key: 'type', value: 'video' },
    { key: 'title', value: gate.title },
    { key: 'is_encrypted', value: 1 },
    { key: 'piece_cid', value: pieceCid },
    { key: 'cid_hash', value: encryptedHash },
    { key: 'original_hash', value: originalHash },
    { key: 'content_mime_type', value: mimeType },
    { key: 'gate_token', value: gate.gateToken.toLowerCase() },
    { key: 'gate_chain', value: gate.chain },
    { key: 'gate_threshold', value: threshold },
    // -- v4 surface ---------------------------------------------------------
    { key: 'gate_version', value: 'v4' },
    { key: 'market_cap_target_usd', value: targetUsd },
    { key: 'drip_index', value: plan.dripIndex },
    { key: 'drip_total', value: plan.dripTotal },
    { key: 'drip_id', value: dripId },
    { key: 'oracle_address', value: gate.oracleAddress.toLowerCase() },
    ...(args.publisherAddress
      ? [{ key: 'published_by', value: args.publisherAddress.toLowerCase() }]
      : []),
  ]

  const metadata = buildGateMetadataV4({
    cid: pieceCid,
    chain: gate.chain,
    tokenAddress: gate.gateToken,
    threshold,
    epoch,
    marketCapTarget: targetUsd,
    oracleAddress: gate.oracleAddress,
    encryptedAesKey: encryptedAesKeyB64,
  })

  const payloadJson = {
    ...metadata,
    // Additive drip-grouping extras (ignored by the frozen v4 guard).
    dripIndex: plan.dripIndex,
    dripTotal: plan.dripTotal,
    dripId,
  }

  return { attributes, payloadJson }
}

/** Epoch at publish time — frozen into the chunk metadata (v3/v4 rule). */
function currentDripEpoch(): number {
  return Math.floor(Date.now() / 1000 / 2_592_000)
}

// ============================================================================
// Braga wallet client (writes)
// ============================================================================

export interface PublisherWalletLike {
  account: { address: string }
  transport?: unknown
}

/**
 * Build an Arkiv wallet client bound to the connected browser provider.
 * Best-effort switches the wallet to the Braga network first; rejection is
 * surfaced as a descriptive error because writes will fail otherwise.
 */
export async function createArkivWriteClient(
  wallet: PublisherWalletLike
): Promise<WalletClient> {
  const provider = extractProvider(wallet.transport)
  if (!provider || typeof (provider as { request?: unknown }).request !== 'function') {
    throw new Error(
      'Connected wallet did not expose an EIP-1193 provider. Install/switch to a wallet that supports custom networks.'
    )
  }

  try {
    await (provider as { request: (args: unknown) => Promise<unknown> }).request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x' + braga.id.toString(16) }],
    })
  } catch {
    // User rejected the switch or the network needs adding — proceed and let
    // createEntity fail loudly if the wallet really cannot sign on Braga.
  }

  return createViemWalletClient({
    account: wallet.account.address as `0x${string}`,
    chain: braga,
    transport: custom(provider as never),
  })
}
function extractProvider(transport: unknown): unknown {
  const t = transport as { provider?: unknown; value?: unknown } | undefined
  return t?.provider ?? t?.value ?? null
}

// ============================================================================
// Orchestrator
// ============================================================================

export interface PublishDripArgs {
  source: Uint8Array
  plans: DripChunkPlan[]
  gate: DripGateConfig
  mimeType: string
  wallet: PublisherWalletLike
  signal?: AbortSignal
  onChunkStage?: (
    progress: DripChunkProgress
  ) => void
}

export type DripStage = 'encrypting' | 'uploading' | 'indexing' | 'done'

export interface DripChunkProgress {
  dripIndex: number
  stage: DripStage
  bytesUploaded?: number
  totalBytes?: number
  pieceCid?: string
  entityKey?: string
}

export class DripPublishError extends Error {
  constructor(
    message: string,
    public readonly dripIndex: number,
    public readonly stage: DripStage
  ) {
    super(message)
    this.name = 'DripPublishError'
  }
}

/** Everything the session layer needs to record a committed stage. */
export interface PublishStageResult {
  pieceCid: string
  entityKey: string
  encryptedHash: string
  originalHash: string
  /** 30-day epoch frozen into this stage's metadata + IBE identity. */
  epoch: number
}

export interface PublishDripStageArgs {
  /**
   * FULL source bytes — the stage's slice is taken from the plan so range
   * math can never drift between session planning and encryption.
   */
  source: Uint8Array
  plan: DripChunkPlan
  gate: DripGateConfig
  mimeType: string
  wallet: PublisherWalletLike
  signal?: AbortSignal
  onChunkStage?: (progress: DripChunkProgress) => void
  /** Publishing wallet — written to the `published_by` attribute. */
  publisherAddress?: string
  /**
   * Shared drip-grouping id. Pass the session's `dripId` when publishing
   * through a staged session; defaults to a fresh uuid (one-shot runs that
   * never mix with sessions).
   */
  dripId?: string
}

/**
 * Publish exactly ONE unlock stage of a drip.
 *
 * Pipeline: slice (per plan) → stream-encrypt with a FRESH AES key → pin to
 * Filecoin → IBE-wrap the key to this chunk's v4 identity (chain, token,
 * threshold, epoch, target, cid — byte-identical to the canister's
 * `computeDerivationInputV4`) → index one Arkiv entity.
 *
 * Safe for cross-wallet/cross-machine staging: wrapping needs only PUBLIC
 * inputs, and the fresh AES key is zeroized immediately after wrapping.
 * ORDERING IS THE CALLER'S JOB — publish stages strictly in dripIndex order
 * (see `drip-session.ts` `nextPublishableIndex`); a gap strands content.
 */
export async function publishDripStage(
  args: PublishDripStageArgs
): Promise<PublishStageResult> {
  const { source, plan, gate, mimeType, wallet, signal, onChunkStage, publisherAddress } = args

  if (!VALID_CHAINS.includes(gate.chain)) {
    throw new DripPublishError(`Unsupported chain ${gate.chain}`, plan.dripIndex, 'encrypting')
  }
  const slice = source.slice(plan.startByte, plan.endByte)
  if (slice.byteLength !== plan.endByte - plan.startByte) {
    throw new DripPublishError(
      `Source too small for stage ${plan.dripIndex} range [${plan.startByte}, ${plan.endByte})`,
      plan.dripIndex,
      'encrypting'
    )
  }

  // Performs the Braga network switch (best-effort) before any writes.
  await createArkivWriteClient(wallet)
  const provider = extractProvider(wallet.transport)
  if (!provider) {
    throw new DripPublishError('Wallet provider unavailable for Arkiv writes', plan.dripIndex, 'indexing')
  }
  const arkivClient = createArkivWalletClient({
    chain: braga,
    transport: custom(provider as never),
    account: wallet.account.address as `0x${string}`,
  })
  const synapse = await getUploadSynapse(wallet)

  // One epoch per STAGE — staged uploads may land in different epochs; each
  // entity records its own and readers replay it during derivation.
  const publishEpoch = currentDripEpoch()
  let lastStage: DripStage = 'encrypting'
  const report = (p: DripChunkProgress) => {
    lastStage = p.stage
    onChunkStage?.(p)
  }

  report({ dripIndex: plan.dripIndex, stage: 'encrypting' })
  const { encrypted, aesKey } = await havenStreamEncrypt(slice, { signal })
  const encryptedHash = await sha256Hex(encrypted)
  const originalHash = await sha256Hex(slice)

  try {
    // Pin ciphertext to Filecoin.
    let uploaded = 0
    const upload = await uploadEncryptedPiece(synapse, encrypted, {
      signal,
      onProgress: (p) =>
        report({
          dripIndex: plan.dripIndex,
          stage: 'uploading',
          bytesUploaded: p.bytesUploaded ?? uploaded,
          totalBytes: p.totalBytes,
        }),
    }).then((r) => {
      uploaded = r.size
      return r
    })

    // IBE-wrap the content key to this chunk's v4 identity.
    const derivationInput = await computeDripDerivationInput({
      chain: gate.chain,
      tokenAddress: gate.gateToken,
      threshold: BigInt(thresholdOf(gate)),
      epoch: BigInt(publishEpoch),
      marketCapTarget: BigInt(Math.round(plan.marketCapTargetUsd)),
      cid: upload.pieceCid,
    })
    const encryptedAesKeyB64 = await wrapAesKey(aesKey, derivationInput)

    // Index the chunk entity in Arkiv.
    report({
      dripIndex: plan.dripIndex,
      stage: 'indexing',
      pieceCid: upload.pieceCid,
    })
    const body = buildDripEntityBody({
      plan,
      gate,
      pieceCid: upload.pieceCid,
      encryptedHash,
      originalHash,
      mimeType,
      encryptedAesKeyB64,
      dripId: args.dripId ?? crypto.randomUUID(),
      epoch: publishEpoch,
      publisherAddress: publisherAddress ?? wallet.account.address,
    })

    const { entityKey } = await arkivClient.createEntity({
      payload: jsonToPayload(body.payloadJson),
      contentType: 'application/json',
      attributes: body.attributes,
      expiresIn: DRIP_ENTITY_EXPIRES_IN_SECONDS,
    })

    report({
      dripIndex: plan.dripIndex,
      stage: 'done',
      pieceCid: upload.pieceCid,
      entityKey,
    })

    return {
      pieceCid: upload.pieceCid,
      entityKey,
      encryptedHash,
      originalHash,
      epoch: publishEpoch,
    }
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Publish cancelled', 'AbortError')
    throw new DripPublishError(
      error instanceof Error ? error.message : String(error),
      plan.dripIndex,
      lastStage
    )
  } finally {
    zeroAesKey(aesKey)
  }
}

/**
 * Publish a full drip in one sitting: n encrypted chunk entities sharing
 * one `dripId`. Thin sequential wrapper over `publishDripStage` kept for
 * bulk flows — each chunk depends on the previous one's success (a gap
 * would strand locked content behind a missing middle chunk), and it keeps
 * wallet prompts predictable.
 */
export async function publishDripChunks(args: PublishDripArgs): Promise<string[]> {
  const { source, plans, gate, mimeType, wallet, signal, onChunkStage } = args

  if (plans.length === 0) throw new DripPublishError('Drip has no chunks', -1, 'encrypting')

  // One shared grouping id for the whole run.
  const dripId = crypto.randomUUID()

  const entityKeys: string[] = []
  for (const plan of plans) {
    if (signal?.aborted) throw new DOMException('Publish cancelled', 'AbortError')
    const result = await publishDripStage({
      source,
      plan,
      gate,
      mimeType,
      wallet,
      signal,
      onChunkStage,
      publisherAddress: wallet.account.address,
      dripId,
    }).catch((error: unknown) => {
      // Re-tag pre-stage failures that never got a plan-scoped index.
      if (error instanceof DripPublishError && error.dripIndex < 0) {
        throw new DripPublishError(error.message, plan.dripIndex, error.stage)
      }
      throw error
    })
    entityKeys.push(result.entityKey)
  }

  return entityKeys
}

/** ~10 years of entity lifetime (2s blocks => seconds here). */
const DRIP_ENTITY_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 365 * 10

function thresholdOf(gate: DripGateConfig): number {
  return Math.max(1, Math.floor(gate.gateThreshold))
}
