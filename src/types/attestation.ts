/**
 * Attestation Types for Community Feed
 *
 * TypeScript interfaces for canister-signed attestations that prove
 * token holding at upload time. Verified offline by readers.
 *
 * @module types/attestation
 */

// ============================================================================
// Attestation Types
// ============================================================================

/**
 * Canister-signed attestation proving token holding at upload time.
 * Stored in Arkiv entity payload. Verified offline by readers.
 */
export interface Attestation {
  /** EVM wallet address that was verified */
  evmAddress: string
  /** EVM chain where balance was checked */
  chain: string
  /** Token contract address */
  tokenAddress: string
  /** Minimum balance required */
  threshold: number
  /** Actual balance at verification time */
  balanceAtCheck: number
  /** SHA-256 of content CID — binds attestation to this entity */
  cidHash: string
  /** Unix timestamp (seconds) when canister verified balance */
  timestamp: number
  /** Hex-encoded Ed25519 signature from Haven-AOL canister */
  signature: string
}

// ============================================================================
// Community Video Types
// ============================================================================

/**
 * A video entity in the community feed with attestation status.
 */
export interface CommunityVideo {
  /** Arkiv entity key */
  id: string
  /** Video title */
  title: string
  /** Entity owner address */
  owner: string
  /** Creator's EVM address */
  creatorAddress: string
  /** Token contract address for the gate */
  gateToken: string
  /** EVM chain for the gate */
  gateChain: string
  /** Minimum token balance required */
  gateThreshold: number
  /** Arkiv creation block height */
  createdAtBlock: number
  /** Whether the content is encrypted */
  isEncrypted: boolean
  /** Attestation data from entity payload (null if none) */
  attestation: Attestation | null
  /** Whether attestation signature has been verified */
  verified: boolean
}

// ============================================================================
// Token Gate Types
// ============================================================================

/**
 * Represents a token gate that defines a community.
 */
export interface TokenGate {
  /** Token contract address */
  tokenAddress: string
  /** EVM chain name */
  chain: string
  /** Minimum balance threshold */
  threshold: number
}
