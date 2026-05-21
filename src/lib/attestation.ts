/**
 * Attestation Verification (Offline)
 *
 * Verifies canister-signed Ed25519 attestation signatures without any
 * network calls. Pure CPU — works offline once the canister public key
 * is cached.
 *
 * @module lib/attestation
 */

import { ed25519 } from '@noble/curves/ed25519.js'
import type { Attestation } from '@/types/attestation'

// ============================================================================
// Constants
// ============================================================================

/** Default TTL: 30 days in seconds */
const ATTESTATION_TTL_SECONDS = 30 * 24 * 60 * 60

// ============================================================================
// Encoding
// ============================================================================

/**
 * Encode attestation to canonical byte format.
 * Must match the canister's `encodeAttestation` format exactly.
 *
 * Format: "HAVEN_ATTEST_V1:{chain}:{tokenAddress}:{threshold}:{evmAddress}:{cidHash}:{timestamp}:{balanceAtCheck}"
 */
function encodeAttestation(a: Attestation): Uint8Array {
  const preimage = `HAVEN_ATTEST_V1:${a.chain}:${a.tokenAddress}:${a.threshold}:${a.evmAddress}:${a.cidHash}:${a.timestamp}:${a.balanceAtCheck}`
  return new TextEncoder().encode(preimage)
}

// ============================================================================
// Signature Verification
// ============================================================================

/**
 * Verify an attestation signature offline. No network calls.
 *
 * Checks:
 * 1. TTL — attestation must not be expired
 * 2. Ed25519 signature — must be valid against the canister public key
 *
 * @param attestation - The attestation struct from entity payload
 * @param canisterPublicKey - The canister's Ed25519 public key (32 bytes)
 * @param options - Optional verification parameters
 * @returns true if signature is valid and attestation is not expired
 */
export function verifyAttestation(
  attestation: Attestation,
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
// Hex Utilities
// ============================================================================

/**
 * Convert hex string to Uint8Array.
 */
function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Invalid hex string length')
  }
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}
