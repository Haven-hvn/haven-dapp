/**
 * Haven-AOL Library Index
 *
 * Central export point for all Haven-AOL modules.
 * Provides decryption operations via ICP VetKD canister.
 *
 * @module lib/haven-aol
 */

// Client configuration
export { getHavenAolConfig, isHavenAolConfigValid } from './haven-aol-client'
export type { HavenAolConfig } from './haven-aol-client'

// Authentication (EIP-712 signing)
export { createSignedGateRequest, retryWithBumpedNonce } from './haven-aol-auth'
export type { SignedGateRequest, WalletClientLike } from './haven-aol-auth'

// Decryption
export { decryptContentKey, decryptCidWithHavenAol } from './haven-aol-decrypt'
export type { DecryptContentKeyOptions, DecryptContentKeyResult, DecryptCidOptions } from './haven-aol-decrypt'

// Metadata adapter
export {
  normalizeChain,
  isHybridV1Metadata,
  isGateMetadata,
  toGateMetadataJson,
  resolveDerivationCid,
  parseEncryptionMetadata,
  normalizeDerivationThreshold,
  derivationThresholdFromAccessCondition,
  normalizeGateMetadataForDerivation,
} from './haven-aol-metadata'
export type {
  HybridV1EncryptionMetadata,
  AccessControlCondition,
  GateMetadataJson,
} from './haven-aol-metadata'

// Error handling
export {
  HavenAolDecryptError,
  mapGateError,
  getHavenAolErrorMessage,
  isRetryableError,
} from './haven-aol-errors'
export type { HavenAolErrorCode } from './haven-aol-errors'

// Nonce management
export { getNextNonce, bumpNonce, clearNonce, getCurrentNonce } from './haven-aol-nonce'
