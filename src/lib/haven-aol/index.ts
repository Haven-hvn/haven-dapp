/**
 * Haven-AOL Library Index
 *
 * @module lib/haven-aol
 */

export { getHavenAolConfig, isHavenAolConfigValid } from './haven-aol-client'
export type { HavenAolConfig } from './haven-aol-client'

export { createSignedGateRequest, retryWithBumpedNonce } from './haven-aol-auth'
export type { SignedGateRequest, WalletClientLike } from './haven-aol-auth'

export { decryptContentKey, decryptCidWithHavenAol } from './haven-aol-decrypt'
export type { DecryptContentKeyOptions, DecryptContentKeyResult, DecryptCidOptions } from './haven-aol-decrypt'

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
} from './haven-aol-metadata'
export type { GateMetadataJson } from './haven-aol-metadata'

export {
  HavenAolDecryptError,
  mapGateError,
  getHavenAolErrorMessage,
  isRetryableError,
} from './haven-aol-errors'
export type { HavenAolErrorCode } from './haven-aol-errors'

export { getNextNonce, bumpNonce, clearNonce, getCurrentNonce } from './haven-aol-nonce'
