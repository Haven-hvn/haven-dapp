/**
 * Haven-AOL Library Index
 *
 * @module lib/haven-aol
 */

export { getHavenAolConfig, isHavenAolConfigValid, getOrCreateAgent, clearAgentCache } from './haven-aol-client'
export type { HavenAolConfig } from './haven-aol-client'

// v3 canister wire (Sprint 5 — additive)
export { requestDecryptionKeyV3, batchRequestDecryptionKeyV3 } from './haven-aol-client'
export type {
  GateRequestV3Wire,
  BatchGateRequestV3Wire,
  GateResultV3,
  BatchGateResultV3,
} from './haven-aol-client'

export {
  createSignedGateRequest,
  createSignedBatchGateRequest,
  retryWithFreshGateNonce,
  retryWithBumpedNonce,
} from './haven-aol-auth'
export type { SignedGateRequest, SignedBatchGateRequest, WalletClientLike } from './haven-aol-auth'

// v3 auth (Sprint 5 — additive)
export {
  createSignedGateRequestV3,
  retryWithFreshV3GateNonce,
} from './haven-aol-auth'
export type {
  SignedGateRequestV3,
  CreateSignedGateRequestV3Options,
} from './haven-aol-auth'

export { batchDecryptContentKeys } from './haven-aol-batch-decrypt'
export type { BatchDecryptResult } from './haven-aol-batch-decrypt'

export { decryptContentKey, decryptCidWithHavenAol } from './haven-aol-decrypt'
export type { DecryptContentKeyOptions, DecryptContentKeyResult, DecryptCidOptions } from './haven-aol-decrypt'

// v3 decrypt paths (Sprint 5 — additive)
export {
  decryptContentKeyV3,
  prefetchGateKeyV3,
} from './haven-aol-decrypt-v3'
export type {
  DecryptContentKeyV3Options,
  DecryptContentKeyV3Result,
  PrefetchGateKeyV3Args,
} from './haven-aol-decrypt-v3'

export { batchDecryptContentKeysV3 } from './haven-aol-batch-decrypt-v3'
export type { BatchDecryptV3Result } from './haven-aol-batch-decrypt-v3'

// v1 / v3 dispatcher (Sprint 5 — additive)
export { decryptAnyContentKey } from './haven-aol-decrypt-dispatch'
export type {
  DecryptAnyContentKeyOptions,
  DecryptAnyContentKeyResult,
} from './haven-aol-decrypt-dispatch'

// Gate-key cache (Sprint 5 — additive, in-memory only)
export {
  GateKeyCache,
  gateKeyCache,
  clearGateKeyCache,
} from './haven-aol-gate-key-cache'
export type { GateKeyCacheKeyParts } from './haven-aol-gate-key-cache'

export {
  GATE_METADATA_VERSION,
  normalizeChain,
  isGateMetadata,
  resolveDerivationCid,
  parseGateMetadata,
  parseEncryptionMetadata,
  parseCidEncryptionMetadata,
  normalizeDerivationThreshold,
  normalizeGateMetadataForDerivation,
  // v3 (Sprint 5 — additive)
  GATE_METADATA_VERSION_V3,
  parseGateMetadataV3,
  isGateMetadataV3,
  parseAnyGateMetadata,
} from './haven-aol-metadata'
export type { GateMetadataJson, GateMetadataV3Json } from './haven-aol-metadata'

export {
  HavenAolDecryptError,
  mapGateError,
  getHavenAolErrorMessage,
  isRetryableError,
} from './haven-aol-errors'
export type { HavenAolErrorCode } from './haven-aol-errors'

export {
  createRandomGateNonce,
  clearNonce,
  getNextNonce,
  bumpNonce,
  getCurrentNonce,
  commitNonceUsed,
  nonceAfterCollision,
} from './haven-aol-nonce'
