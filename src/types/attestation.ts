/**
 * Attestation Types for Community Feed
 *
 * TypeScript interfaces for canister-signed attestations that prove
 * token holding at upload time. Verified offline by readers.
 *
 * Two on-disk shapes coexist:
 *
 *   • SingleAttestation — emitted by the legacy single-CID `attest_holding`
 *     path. Carries one Ed25519 `signature` over the leaf preimage.
 *
 *   • MerkleAttestation — emitted by v2 `batchAttestHolding`. Carries a
 *     per-leaf `merkleProof`, the batch `merkleRoot`, and a single
 *     `rootSignature` over the batch commitment preimage.
 *
 * Reader code uses the discriminated union `Attestation` and the
 * `isMerkleAttestation` type guard to dispatch to the correct verifier.
 *
 * @module types/attestation
 */

// ============================================================================
// Single-CID Attestation (legacy / `attest_holding` path)
// ============================================================================

/**
 * Canister-signed single-CID attestation. Produced by `attest_holding` on the
 * canister and embedded in an Arkiv entity payload by the CLI.
 */
export interface SingleAttestation {
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
// Merkle Attestation (v2 / `batchAttestHolding` path)
// ============================================================================

/** Sibling position in a Merkle proof step. */
export type MerkleSide = 'left' | 'right'

/** One sibling hash in a per-leaf Merkle proof, plus its position. */
export interface MerkleProofEntry {
  /**
   * 'left'  → sibling hash is on the left of the running hash;
   *           verifier computes sha256(0x01 ‖ sibling ‖ current).
   * 'right' → sibling hash is on the right of the running hash;
   *           verifier computes sha256(0x01 ‖ current ‖ sibling).
   */
  side: MerkleSide
  /** 64-char lowercase hex, no `0x` prefix. 32 raw bytes. */
  hash: string
}

/**
 * Canister-signed Merkle batch attestation. Every leaf in a batch carries
 * the same shared metadata + `merkleRoot` + `rootSignature`; only `cidHash`
 * and `merkleProof` differ per leaf.
 */
export interface MerkleAttestation {
  // Shared batch metadata
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
  /** Unix timestamp (seconds) when canister verified balance */
  timestamp: number
  /** Number of real (pre-pad) leaves in the signed batch — required by the verifier preimage */
  cidCount: number

  // Leaf-local
  /** SHA-256 of this entity's content CID — binds attestation to this entity */
  cidHash: string
  /** Per-leaf Merkle proof, in order from leaf to root */
  merkleProof: MerkleProofEntry[]

  // Batch commitment
  /** 64-char lowercase hex, no `0x` prefix. SHA-256 root of the Merkle tree. */
  merkleRoot: string
  /** 128-char lowercase hex, no `0x` prefix. Ed25519 signature over the batch preimage. */
  rootSignature: string
}

/**
 * Discriminated union of attestation shapes that may appear in an Arkiv
 * entity payload. `isMerkleAttestation` discriminates between the two.
 */
export type Attestation = SingleAttestation | MerkleAttestation

/**
 * Type guard: true if the attestation is a v2 Merkle batch attestation.
 *
 * Discriminator: presence of `merkleProof` AND `merkleRoot`. We check both
 * to be robust against partially-populated payloads (a single missing field
 * fails closed and routes the value to the legacy verifier, which will then
 * reject it for missing `signature`).
 */
export function isMerkleAttestation(a: Attestation): a is MerkleAttestation {
  return (
    typeof (a as MerkleAttestation).merkleRoot === 'string' &&
    Array.isArray((a as MerkleAttestation).merkleProof)
  )
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
  /** SHA-256 hash of the content CID, as stored in entity attributes (binds attestation to content) */
  cidHash: string | null
  /** Attestation data from entity payload (null if none). May be SingleAttestation or MerkleAttestation. */
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
