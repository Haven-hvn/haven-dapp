/**
 * V4 Arkiv publishing — entity construction + drip upload orchestrator.
 *
 * One drip run becomes a SERIES header plus one PART entity per chunk
 * (ARKIV_FORMAT 2.0.0):
 *   - `haven.video.drip.series` (7 attrs): title, gate corpus, `drip_id`,
 *     `drip_total` + payload `{ targets, creator?, mime? }` — shared facts
 *     stored once, 52-week BTL;
 *   - `haven.video.drip.part` (7 attrs): `gate_type=4`, `drip_id`,
 *     `drip_idx`, `series_ref`, `mcap_usd`, `sha256_ct` + payload
 *     `{ piece, gate }` — 12-week BTL, refreshed with EXTEND while active.
 *
 * Attribute values are SDK 0.7.0 `{key, value: string|number}` (integers
 * only): `gate_token` is a lowercase-hex str (spec `addr`), `sha256_ct` a
 * hex str (spec `bytes32`), `series_ref` the series entity key hex
 * (spec `key` — no key constructor exists yet, so string equality), and
 * `gate_chain` the EIP-155 id (see `lib/gate-chains`).
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
import { toChainId } from '../gate-chains'
import { mimeToEnum } from '../mime-enum'
import { havenStreamEncrypt, zeroAesKey } from './streaming-encrypt'
import { computeDripDerivationInput, wrapAesKey } from './ibe-wrap'
import { getUploadSynapse, uploadEncryptedPiece } from './synapse-upload'
import { sealedTargetOf, type DripChunkPlan } from './drip-plan'

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
   * Lives inside the v4 gate JSON only (no `oracle_address` attribute —
   * re-add one only when enforced on-chain).
   */
  oracleAddress: string
  /** Display title applied to the series header. */
  title: string
}

export interface DripSeriesBody {
  attributes: Array<{ key: string; value: string | number }>
  payloadJson: Record<string, unknown>
}

export interface DripPartBody {
  attributes: Array<{ key: string; value: string | number }>
  payloadJson: Record<string, unknown>
}

/**
 * Build the attribute list + payload JSON for a drip SERIES header.
 *
 * Shared facts stored once per run — never repeated per chunk. Pure and
 * deterministic given its inputs, so tests can pin the exact wire shapes.
 */
export function buildDripSeriesBody(args: {
  gate: DripGateConfig
  /** Stable per-drip identifier grouping all chunks (uuid). */
  dripId: string
  /** Stage count. */
  dripTotal: number
  /** Per-stage whole-USD unlock targets (ascending). */
  targets: number[]
  /** Creator handle for display (optional). */
  creator?: string
  /** Source MIME type → stored as the shared enum int (optional). */
  mimeType?: string
}): DripSeriesBody {
  const { gate, dripId, dripTotal, targets } = args
  const chainId = toChainId(gate.chain)
  if (chainId === undefined) {
    throw new DripPublishError(`Unsupported chain ${gate.chain}`, -1, 'encrypting')
  }
  const threshold = Math.max(1, Math.floor(gate.gateThreshold))

  const attributes = [
    { key: 'grp', value: 'haven.video.drip.series' },
    { key: 'title', value: gate.title },
    { key: 'gate_type', value: 4 },
    { key: 'gate_token', value: gate.gateToken.toLowerCase() },
    { key: 'gate_chain', value: chainId },
    { key: 'gate_threshold', value: threshold },
    { key: 'drip_id', value: dripId },
    { key: 'drip_total', value: dripTotal },
  ]

  const payloadJson: Record<string, unknown> = {
    targets: targets.map((t) => Math.round(t)),
  }
  if (args.creator) payloadJson.creator = args.creator
  const mime = mimeToEnum(args.mimeType)
  if (mime !== undefined) payloadJson.mime = mime

  return { attributes, payloadJson }
}

/**
 * Build the attribute list + payload JSON for one drip PART (chunk) entity.
 *
 * The payload is a NATIVE v4 gate-metadata record (built by the haven-aol
 * SDK's `buildGateMetadataV4`, which pins field order + validation) under
 * `gate`, plus the Filecoin `piece` locator. No attribute mirrors, no
 * per-chunk series facts — those live on the series header.
 *
 * Pure and deterministic given its inputs (the caller injects CIDs/hashes),
 * so tests can pin the exact wire shapes without mocks.
 */
export function buildDripPartBody(args: {
  plan: Pick<DripChunkPlan, 'dripIndex' | 'marketCapTargetUsd' | 'marketCapTarget' | 'targetUnit'>
  gate: DripGateConfig
  pieceCid: string
  /** sha256 hex of the ciphertext bytes (stored bare-lowercase). */
  encryptedHash: string
  encryptedAesKeyB64: string
  /** Stable per-drip identifier grouping all chunks (uuid). */
  dripId: string
  /** Entity key of the series header — one indexed fan-out query. */
  seriesRef: string
  /** Publish epoch — pass once per run so all chunks share it. */
  epoch?: number
}): DripPartBody {
  const { plan, gate, pieceCid, encryptedHash, encryptedAesKeyB64, dripId, seriesRef } =
    args
  const epoch = args.epoch ?? currentDripEpoch()

  const threshold = Math.max(1, Math.floor(gate.gateThreshold))
  const targetUsd = Math.round(plan.marketCapTargetUsd)
  // Consensus target: the sealed value (whole ETH for curve gates), never
  // the USD intent. `mcap_usd` below stays USD — it is discovery/display,
  // not consensus.
  const sealed = sealedTargetOf(plan)

  const attributes = [
    { key: 'grp', value: 'haven.video.drip.part' },
    // gate_type=4: 1=per-file, 3=per-epoch, 4=per-marketcap.
    { key: 'gate_type', value: 4 },
    { key: 'drip_id', value: dripId },
    { key: 'drip_idx', value: plan.dripIndex },
    { key: 'series_ref', value: seriesRef },
    { key: 'mcap_usd', value: targetUsd },
    { key: 'sha256_ct', value: encryptedHash.replace(/^0x/i, '').toLowerCase() },
  ]

  const metadata = buildGateMetadataV4({
    cid: pieceCid,
    chain: gate.chain,
    tokenAddress: gate.gateToken,
    threshold,
    epoch,
    marketCapTarget: sealed.target,
    oracleAddress: gate.oracleAddress,
    encryptedAesKey: encryptedAesKeyB64,
  })

  const payloadJson = {
    piece: pieceCid,
    gate: JSON.stringify(metadata),
  }

  return { attributes, payloadJson }
}

/** Epoch at publish time — frozen into the chunk metadata (v3/v4 rule). */
function currentDripEpoch(): number {
  return Math.floor(Date.now() / 1000 / 2_592_000)
}

/** Minimal write surface `ensureDripSeries` needs (wallet or public client). */
export interface SeriesStore {
  createEntity: (args: {
    payload: Uint8Array
    contentType: string
    attributes: Array<{ key: string; value: string | number }>
    expiresIn: number
  }) => Promise<{ entityKey: string }>
  query?: (
    query: string,
    opts?: unknown
  ) => Promise<{ entities?: Array<{ key?: string; attributes?: Array<{ key: string; value: unknown }> }> }>
}

function findAttr(
  attrs: Array<{ key: string; value: unknown }> | undefined,
  key: string
): unknown {
  return attrs?.find((a) => a.key === key)?.value
}

/**
 * Find-or-create the series header for a drip run, keyed by `drip_id`.
 *
 * Lookup is a single `drip_id` equality (near-unique) with a client-side
 * `grp` check — no AND-syntax assumptions about the chain's query dialect.
 * Any lookup failure falls through to create: readers group by `drip_id`,
 * so a duplicate series degrades to one extra fetch, never stranded parts.
 */
export async function ensureDripSeries(
  store: SeriesStore,
  args: {
    gate: DripGateConfig
    dripId: string
    dripTotal: number
    targets: number[]
    creator?: string
    mimeType?: string
  }
): Promise<string> {
  if (store.query) {
    try {
      const result = await store.query(`drip_id = "${args.dripId}"`, {
        resultsPerPage: 5,
      })
      for (const entity of result?.entities ?? []) {
        if (findAttr(entity.attributes, 'grp') === 'haven.video.drip.series') {
          return String(entity.key)
        }
      }
    } catch {
      // Fall through to create.
    }
  }

  const body = buildDripSeriesBody(args)
  const { entityKey } = await store.createEntity({
    payload: jsonToPayload(body.payloadJson),
    contentType: 'application/json',
    attributes: body.attributes,
    expiresIn: DRIP_SERIES_EXPIRES_IN_SECONDS,
  })
  return entityKey
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
  /**
   * Shared drip-grouping id. Pass the session's `dripId` when publishing
   * through a staged session; defaults to a fresh uuid (one-shot runs that
   * never mix with sessions).
   */
  dripId?: string
  /**
   * Entity key of the series header. When absent the stage ensures the
   * series itself (find-or-create by `drip_id`) before indexing the part,
   * so standalone publishes stay one call.
   */
  seriesRef?: string
}

/**
 * Publish exactly ONE unlock stage of a drip.
 *
 * Pipeline: ensure series → slice (per plan) → stream-encrypt with a FRESH
 * AES key → pin to Filecoin → IBE-wrap the key to this chunk's v4 identity
 * (chain, token, threshold, epoch, target, cid — byte-identical to the
 * canister's `computeDerivationInputV4`) → index one PART entity.
 *
 * Safe for cross-wallet/cross-machine staging: wrapping needs only PUBLIC
 * inputs, and the fresh AES key is zeroized immediately after wrapping.
 * ORDERING IS THE CALLER'S JOB — publish stages strictly in dripIndex order
 * (see `drip-session.ts` `nextPublishableIndex`); a gap strands content.
 */
export async function publishDripStage(
  args: PublishDripStageArgs
): Promise<PublishStageResult> {
  const { source, plan, gate, mimeType, wallet, signal, onChunkStage } = args
  const dripId = args.dripId ?? crypto.randomUUID()

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
    // marketCapTarget MUST equal the sealed gate-metadata value above —
    // derivation and gate disagreeing bricks the chunk for every reader.
    const derivationSealed = sealedTargetOf(plan)
    const derivationInput = await computeDripDerivationInput({
      chain: gate.chain,
      tokenAddress: gate.gateToken,
      threshold: BigInt(thresholdOf(gate)),
      epoch: BigInt(publishEpoch),
      marketCapTarget: BigInt(derivationSealed.target),
      cid: upload.pieceCid,
    })
    const encryptedAesKeyB64 = await wrapAesKey(aesKey, derivationInput)

    // Index the series header (find-or-create by drip_id) so the part can
    // reference it, then index the chunk part entity in Arkiv.
    report({
      dripIndex: plan.dripIndex,
      stage: 'indexing',
      pieceCid: upload.pieceCid,
    })
    const seriesRef =
      args.seriesRef ??
      (await ensureDripSeries(arkivClient, {
        gate,
        dripId,
        dripTotal: plan.dripTotal,
        targets: [Math.round(plan.marketCapTargetUsd)],
        mimeType,
      }))
    const body = buildDripPartBody({
      plan,
      gate,
      pieceCid: upload.pieceCid,
      encryptedHash,
      encryptedAesKeyB64,
      dripId,
      seriesRef,
      epoch: publishEpoch,
    })

    const { entityKey } = await arkivClient.createEntity({
      payload: jsonToPayload(body.payloadJson),
      contentType: 'application/json',
      attributes: body.attributes,
      expiresIn: DRIP_PART_EXPIRES_IN_SECONDS,
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
 * Publish a full drip in one sitting: one series header plus n part
 * entities sharing one `dripId`. Thin sequential wrapper over
 * `publishDripStage` kept for bulk flows — each chunk depends on the
 * previous one's success (a gap would strand locked content behind a
 * missing middle chunk), and it keeps wallet prompts predictable.
 */
export async function publishDripChunks(args: PublishDripArgs): Promise<string[]> {
  const { source, plans, gate, mimeType, wallet, signal, onChunkStage } = args

  if (plans.length === 0) throw new DripPublishError('Drip has no chunks', -1, 'encrypting')

  // One shared grouping id + one series header for the whole run.
  const dripId = crypto.randomUUID()

  // Series needs a write client of its own (stages each build theirs).
  await createArkivWriteClient(wallet)
  const provider = extractProvider(wallet.transport)
  if (!provider) {
    throw new DripPublishError('Wallet provider unavailable for Arkiv writes', -1, 'indexing')
  }
  const arkivClient = createArkivWalletClient({
    chain: braga,
    transport: custom(provider as never),
    account: wallet.account.address as `0x${string}`,
  })
  const seriesRef = await ensureDripSeries(arkivClient, {
    gate,
    dripId,
    dripTotal: plans.length,
    targets: plans.map((p) => Math.round(p.marketCapTargetUsd)),
    mimeType,
  })

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
      dripId,
      seriesRef,
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

/** Series header lifetime: 52 weeks (outlives its parts). */
const DRIP_SERIES_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 7 * 52

/** Part lifetime: 12 weeks — refreshed with EXTEND while the series is active. */
const DRIP_PART_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 7 * 12

function thresholdOf(gate: DripGateConfig): number {
  return Math.max(1, Math.floor(gate.gateThreshold))
}
