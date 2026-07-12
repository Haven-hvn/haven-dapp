/**
 * Haven-AOL Client Configuration
 *
 * Provides configuration and agent factory for communicating with the
 * Haven-AOL ICP canister. Uses anonymous identity — authorization proof
 * is always EVM (EIP-712 + on-chain balance checked by canister).
 *
 * **v3 surface** — `requestDecryptionKeyV3` and `batchRequestDecryptionKeyV3`
 * are appended below the v1 surface (Sprint 5). They use a separate Candid
 * IDL factory so the existing v1 actor cache remains untouched. The Candid
 * shape mirrors `tasking/sprint-0-foundations/contracts/backend-v3.did.fragment`
 * and is consumed by the v3 decrypt path. v1 methods are byte-for-byte
 * unchanged.
 *
 * @module lib/haven-aol/haven-aol-client
 */

import {
  Actor,
  HttpAgent,
  AnonymousIdentity,
  type ActorMethod,
  type ActorSubclass,
} from '@icp-sdk/core/agent'
import { IDL } from '@icp-sdk/core/candid'
import type { Chain } from 'haven-aol'

// ============================================================================
// Configuration
// ============================================================================

/**
 * Haven-AOL configuration from environment variables.
 */
export interface HavenAolConfig {
  /** ICP host URL */
  host: string
  /** Haven-AOL canister ID */
  canisterId: string
  /** EIP-712 chain ID for signature verification */
  eip712ChainId: bigint
  /** EIP-712 verifying contract address */
  eip712VerifyingContract: string
  /** Whether to fetch root key (local dev only) */
  fetchRootKey: boolean
}

/**
 * Get Haven-AOL configuration from environment variables.
 * 
 * @returns The validated configuration
 * @throws Error if required environment variables are missing
 */
export function getHavenAolConfig(): HavenAolConfig {
  const host = process.env.NEXT_PUBLIC_ICP_HOST || 'https://icp-api.io'
  const canisterId = process.env.NEXT_PUBLIC_HAVEN_AOL_CANISTER_ID || 'dciac-uaaaa-aaaad-qlzuq-cai'
  const eip712ChainId = BigInt(process.env.NEXT_PUBLIC_EIP712_CHAIN_ID || '1')
  const eip712VerifyingContract = process.env.NEXT_PUBLIC_EIP712_VERIFYING_CONTRACT || '0x0000000000000000000000000000000000000000'
  const fetchRootKey = process.env.NEXT_PUBLIC_HAVEN_AOL_FETCH_ROOT_KEY === 'true'

  return {
    host,
    canisterId,
    eip712ChainId,
    eip712VerifyingContract,
    fetchRootKey,
  }
}

/**
 * Check if Haven-AOL configuration is valid and ready for use.
 * 
 * @returns True if all required configuration is present
 */
export function isHavenAolConfigValid(): boolean {
  try {
    const config = getHavenAolConfig()
    return Boolean(
      config.host &&
      config.canisterId &&
      config.eip712VerifyingContract &&
      config.eip712VerifyingContract !== '0x0000000000000000000000000000000000000000'
    )
  } catch {
    return false
  }
}

// ============================================================================
// Singleton HttpAgent
// ============================================================================

let cachedAgent: HttpAgent | null = null
let cachedAgentHost: string | null = null

/**
 * Get or create a singleton HttpAgent for Haven-AOL canister calls.
 *
 * Safe to reuse because:
 * - Uses AnonymousIdentity (no per-user state)
 * - Config (host, canisterId) doesn't change at runtime
 * - HttpAgent handles connection pooling internally
 *
 * The agent caches subnet node keys internally with a 5-minute TTL,
 * so reusing it avoids redundant read_state calls.
 *
 * @returns A reusable HttpAgent instance
 */
export async function getOrCreateAgent(): Promise<HttpAgent> {
  const config = getHavenAolConfig()

  // Reuse if host hasn't changed
  if (cachedAgent && cachedAgentHost === config.host) {
    return cachedAgent
  }

  const agent = await HttpAgent.create({
    host: config.host,
    identity: new AnonymousIdentity(),
    verifyQuerySignatures: false, // Skip for anonymous agent (canister does EVM auth)
  })

  if (config.fetchRootKey) {
    await agent.fetchRootKey()
  }

  cachedAgent = agent
  cachedAgentHost = config.host
  return agent
}

/**
 * Clear the cached agent (e.g., on config change, wallet disconnect, or for testing).
 */
export function clearAgentCache(): void {
  cachedAgent = null
  cachedAgentHost = null
}

// ============================================================================
// v3 Candid surface
// ============================================================================
//
// The v3 IDL factory is defined here (rather than imported from the SDK)
// because:
//   1. Sprint 3's TS SDK exposes v3 derivation/metadata but does NOT ship a
//      canister actor for v3 endpoints — Sprint 5 owns that.
//   2. Keeping the IDL co-located with `getOrCreateAgent` makes Candid drift
//      easy to spot during code review (everything talking to the canister
//      is in one file).
// The factory MUST stay byte-identical to the canister's
// `backend.did` v3 service entries.

const ChainV3Variant = IDL.Variant({
  EthMainnet: IDL.Null,
  EthSepolia: IDL.Null,
  ArbitrumOne: IDL.Null,
  BaseMainnet: IDL.Null,
  OptimismMainnet: IDL.Null,
})

const GateRequestV3Type = IDL.Record({
  chain: ChainV3Variant,
  tokenAddress: IDL.Text,
  threshold: IDL.Nat,
  epoch: IDL.Nat,
  evmAddress: IDL.Text,
  transportPublicKey: IDL.Vec(IDL.Nat8),
  nonce: IDL.Nat,
  signature: IDL.Vec(IDL.Nat8),
  eip712ChainId: IDL.Nat,
  eip712VerifyingContract: IDL.Text,
})

const BatchGateRequestV3Type = IDL.Record({
  chain: ChainV3Variant,
  tokenAddress: IDL.Text,
  threshold: IDL.Nat,
  epoch: IDL.Nat,
  cids: IDL.Vec(IDL.Text),
  evmAddress: IDL.Text,
  transportPublicKey: IDL.Vec(IDL.Nat8),
  nonce: IDL.Nat,
  signature: IDL.Vec(IDL.Nat8),
  eip712ChainId: IDL.Nat,
  eip712VerifyingContract: IDL.Text,
})

const GateErrorV3Variant = IDL.Variant({
  InsufficientBalance: IDL.Record({ required: IDL.Nat, actual: IDL.Nat }),
  InvalidAddress: IDL.Text,
  InvalidThreshold: IDL.Null,
  EvmRpcError: IDL.Text,
  VetKDError: IDL.Text,
  InvalidSignature: IDL.Text,
  NonceAlreadyUsed: IDL.Null,
  InvalidEpoch: IDL.Null,
})

const GateResultV3Variant = IDL.Variant({
  ok: IDL.Record({
    encrypted_key: IDL.Vec(IDL.Nat8),
    verification_key: IDL.Vec(IDL.Nat8),
  }),
  err: GateErrorV3Variant,
})

const BatchKeyEntryV3Type = IDL.Record({
  cid: IDL.Text,
  encrypted_key: IDL.Vec(IDL.Nat8),
})

const BatchGateResultV3Variant = IDL.Variant({
  ok: IDL.Record({
    keys: IDL.Vec(BatchKeyEntryV3Type),
    verification_key: IDL.Vec(IDL.Nat8),
  }),
  err: GateErrorV3Variant,
})

interface HavenAolCanisterV3Actor {
  requestDecryptionKeyV3: ActorMethod<[unknown], { ok: { encrypted_key: Uint8Array | number[]; verification_key: Uint8Array | number[] } } | { err: unknown }>
  batchRequestDecryptionKeyV3: ActorMethod<[unknown], { ok: { keys: Array<{ cid: string; encrypted_key: Uint8Array | number[] }>; verification_key: Uint8Array | number[] } } | { err: unknown }>
}

const v3IdlFactory = () =>
  IDL.Service({
    requestDecryptionKeyV3: IDL.Func([GateRequestV3Type], [GateResultV3Variant], []),
    batchRequestDecryptionKeyV3: IDL.Func(
      [BatchGateRequestV3Type],
      [BatchGateResultV3Variant],
      [],
    ),
  })

const v3ActorCache = new WeakMap<HttpAgent, Map<string, ActorSubclass<HavenAolCanisterV3Actor>>>()

function getOrCreateV3Actor(
  agent: HttpAgent,
  canisterId: string,
): ActorSubclass<HavenAolCanisterV3Actor> {
  let perAgent = v3ActorCache.get(agent)
  if (!perAgent) {
    perAgent = new Map()
    v3ActorCache.set(agent, perAgent)
  }
  let actor = perAgent.get(canisterId)
  if (!actor) {
    actor = Actor.createActor<HavenAolCanisterV3Actor>(v3IdlFactory, { agent, canisterId })
    perAgent.set(canisterId, actor)
  }
  return actor
}

// =============================================================================
// v3 public types (mirror Sprint 0 contracts/README.md Candid surface)
// =============================================================================

/** Wire shape passed to `requestDecryptionKeyV3`. */
export interface GateRequestV3Wire {
  chain: Chain
  tokenAddress: string
  threshold: bigint
  epoch: bigint
  evmAddress: string
  transportPublicKey: Uint8Array
  nonce: bigint
  signature: Uint8Array
  eip712ChainId: bigint
  eip712VerifyingContract: string
}

/** Wire shape passed to `batchRequestDecryptionKeyV3`. */
export interface BatchGateRequestV3Wire {
  chain: Chain
  tokenAddress: string
  threshold: bigint
  epoch: bigint
  cids: string[]
  evmAddress: string
  transportPublicKey: Uint8Array
  nonce: bigint
  signature: Uint8Array
  eip712ChainId: bigint
  eip712VerifyingContract: string
}

/** Decoded v3 single-CID result. */
export type GateResultV3 =
  | { ok: { encryptedKey: Uint8Array; verificationKey: Uint8Array } }
  | { err: unknown }

/** Decoded v3 batch result. */
export type BatchGateResultV3 =
  | {
      ok: {
        keys: Array<{ cid: string; encryptedKey: Uint8Array }>
        verificationKey: Uint8Array
      }
    }
  | { err: unknown }

function buildChainVariant(chain: Chain): Record<string, null> {
  return { [chain]: null }
}

/**
 * Call the canister's `requestDecryptionKeyV3` endpoint.
 *
 * Returns both the v3-derived encrypted key AND the shared verification key
 * in one response (same shape as v1). The dapp v3 decrypt path is the only
 * call site.
 */
export async function requestDecryptionKeyV3(
  agent: HttpAgent,
  canisterId: string,
  request: GateRequestV3Wire,
): Promise<GateResultV3> {
  const actor = getOrCreateV3Actor(agent, canisterId)
  const raw = await actor.requestDecryptionKeyV3({
    chain: buildChainVariant(request.chain),
    tokenAddress: request.tokenAddress,
    threshold: request.threshold,
    epoch: request.epoch,
    evmAddress: request.evmAddress,
    transportPublicKey: request.transportPublicKey,
    nonce: request.nonce,
    signature: request.signature,
    eip712ChainId: request.eip712ChainId,
    eip712VerifyingContract: request.eip712VerifyingContract,
  })

  if ('ok' in raw) {
    return {
      ok: {
        encryptedKey: new Uint8Array(raw.ok.encrypted_key),
        verificationKey: new Uint8Array(raw.ok.verification_key),
      },
    }
  }
  return { err: raw.err }
}

/**
 * Call the canister's `batchRequestDecryptionKeyV3` endpoint.
 *
 * v3 batches share a single `(community, epoch)` VetKey — every CID in the
 * batch decrypts off the same recovered key. The canister still returns one
 * `encrypted_key` per CID for backward-compatibility with v1 batch wiring,
 * but they are all the same v3 derivation; callers may cache the recovered
 * key under `(chain, tokenAddress, threshold, epoch)` once.
 */
export async function batchRequestDecryptionKeyV3(
  agent: HttpAgent,
  canisterId: string,
  request: BatchGateRequestV3Wire,
): Promise<BatchGateResultV3> {
  const actor = getOrCreateV3Actor(agent, canisterId)
  const raw = await actor.batchRequestDecryptionKeyV3({
    chain: buildChainVariant(request.chain),
    tokenAddress: request.tokenAddress,
    threshold: request.threshold,
    epoch: request.epoch,
    cids: request.cids,
    evmAddress: request.evmAddress,
    transportPublicKey: request.transportPublicKey,
    nonce: request.nonce,
    signature: request.signature,
    eip712ChainId: request.eip712ChainId,
    eip712VerifyingContract: request.eip712VerifyingContract,
  })

  if ('ok' in raw) {
    return {
      ok: {
        keys: raw.ok.keys.map((entry: { cid: string; encrypted_key: Uint8Array | number[] }) => ({
          cid: entry.cid,
          encryptedKey: new Uint8Array(entry.encrypted_key),
        })),
        verificationKey: new Uint8Array(raw.ok.verification_key),
      },
    }
  }
  return { err: raw.err }
}
