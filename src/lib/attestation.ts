/**
 * Attestation Verification (Offline)
 *
 * Verifies canister-signed attestation payloads without any network calls.
 * Pure CPU — works offline once the canister public key is cached.
 *
 * Two payload shapes are verified here:
 *
 *   • `SingleAttestation` (legacy `attest_holding` path) — one Ed25519
 *     signature over the leaf preimage.
 *
 *   • `MerkleAttestation` (v2 `batchAttestHolding` path) — a per-leaf
 *     Merkle proof reconstructed against `merkleRoot` (RFC 6962-style
 *     domain separation), then one Ed25519 signature over the batch
 *     commitment preimage.
 *
 * Both verifiers reject payloads older than `ATTESTATION_TTL_SECONDS`.
 *
 * @module lib/attestation
 */

import { ed25519 } from '@noble/curves/ed25519.js'
import { sha256 } from '@noble/hashes/sha2.js'
import type {
  Attestation,
  MerkleAttestation,
  MerkleProofEntry,
  SingleAttestation,
} from '@/types/attestation'

// ============================================================================
// Constants
// ============================================================================

/** Default TTL: 30 days in seconds. Same policy for single + Merkle. */
const ATTESTATION_TTL_SECONDS = 30 * 24 * 60 * 60

/** RFC 6962 domain separation: leaf hashes are prefixed with 0x00. */
const LEAF_PREFIX = new Uint8Array([0x00])
/** RFC 6962 domain separation: internal-node hashes are prefixed with 0x01. */
const NODE_PREFIX = new Uint8Array([0x01])

// ============================================================================
// Encoding (single-CID path)
// ============================================================================

/**
 * Encode a single-CID attestation to canonical byte format.
 * Must match the canister's `encodeAttestation` format exactly.
 *
 * Format: "HAVEN_ATTEST_V1:{chain}:{tokenAddress}:{threshold}:{evmAddress}:{cidHash}:{timestamp}:{balanceAtCheck}"
 */
function encodeAttestation(a: SingleAttestation): Uint8Array {
  const preimage = `HAVEN_ATTEST_V1:${a.chain}:${a.tokenAddress}:${a.threshold}:${a.evmAddress}:${a.cidHash}:${a.timestamp}:${a.balanceAtCheck}`
  return new TextEncoder().encode(preimage)
}

// ============================================================================
// Encoding (Merkle / batch path)
// ============================================================================

/**
 * Compute the canonical leaf preimage bytes for a single CID inside a
 * Merkle batch. Mirrors the canister's per-leaf preimage exactly.
 *
 * Format: "HAVEN_ATTEST_V1:{chain}:{tokenAddress}:{threshold}:{evmAddress}:{cidHash}:{timestamp}:{balanceAtCheck}"
 *
 * Note: this is the *same* string form used by `encodeAttestation` for the
 * single-CID path. The Merkle path differs only in that it then prefixes
 * the bytes with `LEAF_PREFIX` (`0x00`) before hashing.
 */
function encodeMerkleLeafPreimage(a: MerkleAttestation): Uint8Array {
  const preimage = `HAVEN_ATTEST_V1:${a.chain}:${a.tokenAddress}:${a.threshold}:${a.evmAddress}:${a.cidHash}:${a.timestamp}:${a.balanceAtCheck}`
  return new TextEncoder().encode(preimage)
}

/**
 * Compute the canonical batch commitment preimage bytes (the message that
 * the canister actually signs with `sign_with_schnorr`).
 *
 * Format: "HAVEN_BATCH_ATTEST_V1:{chain}:{tokenAddress}:{threshold}:{evmAddress}:{merkleRootHex}:{cidCount}:{timestamp}:{balanceAtCheck}"
 *
 * `merkleRootHex` is exactly the lowercase 64-char hex string carried in
 * `MerkleAttestation.merkleRoot` (no `0x` prefix).
 */
function encodeBatchPreimage(a: MerkleAttestation): Uint8Array {
  const preimage = `HAVEN_BATCH_ATTEST_V1:${a.chain}:${a.tokenAddress}:${a.threshold}:${a.evmAddress}:${a.merkleRoot}:${a.cidCount}:${a.timestamp}:${a.balanceAtCheck}`
  return new TextEncoder().encode(preimage)
}

// ============================================================================
// Signature Verification (single-CID path)
// ============================================================================

/**
 * Verify a single-CID attestation signature offline. No network calls.
 *
 * Checks:
 * 1. TTL — attestation must not be expired
 * 2. Ed25519 signature — must be valid against the canister public key
 *
 * @param attestation - The single-CID attestation struct from the entity payload
 * @param canisterPublicKey - The canister's Ed25519 public key (32 bytes)
 * @param options - Optional verification parameters
 * @returns true if signature is valid and attestation is not expired
 */
export function verifyAttestation(
  attestation: SingleAttestation,
  canisterPublicKey: Uint8Array,
  options: { ttlSeconds?: number; nowSeconds?: number } = {}
): boolean {
  const {
    ttlSeconds = ATTESTATION_TTL_SECONDS,
    nowSeconds = Math.floor(Date.now() / 1000),
  } = options

  // 1. Check TTL
  if (nowSeconds - attestation.timestamp > ttlSeconds) {
    return false // Expired
  }

  // 2. Encode attestation to canonical bytes
  const attestationBytes = encodeAttestation(attestation)

  // 3. Verify Ed25519 signature
  try {
    // Strip 0x prefix if present, then decode hex to bytes
    const sigHex = attestation.signature.startsWith('0x')
      ? attestation.signature.slice(2)
      : attestation.signature
    const signatureBytes = hexToBytes(sigHex)
    return ed25519.verify(signatureBytes, attestationBytes, canisterPublicKey)
  } catch {
    return false // Invalid signature format
  }
}

// ============================================================================
// Signature Verification (Merkle / batch path)
// ============================================================================

/**
 * Verify a v2 Merkle batch attestation entirely offline.
 *
 * Steps:
 *   1. TTL — same 30-day policy as the single-CID path.
 *   2. Reconstruct the leaf hash with RFC 6962 leaf prefix:
 *        leaf_h = sha256(0x00 ‖ leafPreimage)
 *   3. Walk `merkleProof` from leaf → root, applying RFC 6962 node prefix:
 *        side='left'  → h = sha256(0x01 ‖ sibling ‖ h)
 *        side='right' → h = sha256(0x01 ‖ h ‖ sibling)
 *      and assert the final running hash equals `merkleRoot`.
 *   4. Verify the Ed25519 `rootSignature` over the canonical batch preimage.
 *
 * Any malformed hex / signature failure returns false (no throws escape).
 *
 * @param attestation - v2 Merkle batch attestation from the entity payload
 * @param canisterPublicKey - canister's Ed25519 public key (32 bytes)
 * @param options - Optional verification parameters
 * @returns true iff TTL OK, proof reconstructs to `merkleRoot`, and sig verifies
 */
export function verifyMerkleAttestation(
  attestation: MerkleAttestation,
  canisterPublicKey: Uint8Array,
  options: { ttlSeconds?: number; nowSeconds?: number } = {}
): boolean {
  const {
    ttlSeconds = ATTESTATION_TTL_SECONDS,
    nowSeconds = Math.floor(Date.now() / 1000),
  } = options

  // 1. TTL
  if (nowSeconds - attestation.timestamp > ttlSeconds) {
    return false
  }

  try {
    // 2. Reconstruct leaf hash with leaf prefix.
    const leafPreimage = encodeMerkleLeafPreimage(attestation)
    let h: Uint8Array = sha256(concat(LEAF_PREFIX, leafPreimage))

    // 3. Walk the proof.
    for (const step of attestation.merkleProof) {
      if (!isValidProofStep(step)) return false
      const sibling = hexToBytes(step.hash)
      if (sibling.length !== 32) return false
      h =
        step.side === 'left'
          ? sha256(concat(NODE_PREFIX, sibling, h))
          : sha256(concat(NODE_PREFIX, h, sibling))
    }

    // 4. Root match (constant-time on hex compare is unnecessary here —
    //    the root and proof are public; this is integrity, not secrecy).
    const rootBytes = hexToBytes(attestation.merkleRoot)
    if (rootBytes.length !== 32) return false
    if (!bytesEqual(h, rootBytes)) return false

    // 5. Verify the root signature.
    const sigHex = attestation.rootSignature.startsWith('0x')
      ? attestation.rootSignature.slice(2)
      : attestation.rootSignature
    const sigBytes = hexToBytes(sigHex)
    const batchBytes = encodeBatchPreimage(attestation)
    return ed25519.verify(sigBytes, batchBytes, canisterPublicKey)
  } catch {
    return false
  }
}

function isValidProofStep(step: MerkleProofEntry): boolean {
  return (
    (step.side === 'left' || step.side === 'right') &&
    typeof step.hash === 'string' &&
    step.hash.length === 64
  )
}

// ============================================================================
// Entity Cross-Check
// ============================================================================

/**
 * Verify attestation matches the entity it's attached to.
 * Cross-checks attestation fields against entity attributes to prevent replay
 * (i.e. attaching one entity's attestation to another).
 *
 * All listed fields are REQUIRED: missing values fail closed. Optional
 * presence checks were removed because they allowed an attacker to elide
 * the binding fields and still render verified.
 *
 * Accepts the union — `SingleAttestation` and `MerkleAttestation` carry the
 * same five binding fields with the same names and semantics, so the body
 * is unchanged.
 */
export function attestationMatchesEntity(
  attestation: Attestation,
  entity: {
    creator: string
    attributes: {
      gate_token?: string
      gate_chain?: string
      gate_threshold?: number
      cid_hash?: string
    }
  }
): boolean {
  // Attestation must be for the entity's creator
  if (
    !attestation.evmAddress ||
    !entity.creator ||
    attestation.evmAddress.toLowerCase() !== entity.creator.toLowerCase()
  ) {
    return false
  }

  // Attestation must be for this entity's token gate (required)
  if (
    !entity.attributes.gate_token ||
    attestation.tokenAddress.toLowerCase() !== entity.attributes.gate_token.toLowerCase()
  ) {
    return false
  }

  // Attestation must be for this entity's chain (required)
  if (
    !entity.attributes.gate_chain ||
    attestation.chain.toLowerCase() !== entity.attributes.gate_chain.toLowerCase()
  ) {
    return false
  }

  // Attestation threshold must match the gate's threshold (required).
  // Without this, an attestation issued for a 1-token gate could be displayed
  // on a 1M-token gate.
  if (
    entity.attributes.gate_threshold === undefined ||
    attestation.threshold !== entity.attributes.gate_threshold
  ) {
    return false
  }

  // Attestation must be bound to this entity's content (anti-replay).
  // REQUIRED: if the entity has no cid_hash attribute, fail closed — the
  // signature alone does not bind the attestation to specific content.
  if (
    !entity.attributes.cid_hash ||
    !attestation.cidHash ||
    attestation.cidHash !== entity.attributes.cid_hash
  ) {
    return false
  }

  return true
}

// ============================================================================
// Byte / Hex Utilities
// ============================================================================

/**
 * Convert hex string to Uint8Array. Throws on invalid input — callers
 * wrap this in try/catch to translate failures into `return false`.
 */
function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Invalid hex string length')
  }
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    const byte = parseInt(hex.slice(i, i + 2), 16)
    if (Number.isNaN(byte)) {
      throw new Error('Invalid hex character')
    }
    bytes[i / 2] = byte
  }
  return bytes
}

/** Concatenate multiple Uint8Arrays into a single new Uint8Array. */
function concat(...parts: Uint8Array[]): Uint8Array {
  let total = 0
  for (const p of parts) total += p.length
  const out = new Uint8Array(total)
  let off = 0
  for (const p of parts) {
    out.set(p, off)
    off += p.length
  }
  return out
}

/** Constant-length byte equality (32-byte hashes — length pre-checked). */
function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}
