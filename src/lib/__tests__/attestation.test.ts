/**
 * Tests for lib/attestation.ts
 *
 * Focus: ensure attestationMatchesEntity is replay-resistant. An attestation
 * that is valid for entity A must NOT verify when attached to entity B.
 */

import { describe, it, expect } from 'vitest'
import { ed25519 } from '@noble/curves/ed25519.js'
import {
  verifyAttestation,
  attestationMatchesEntity,
} from '../attestation'
import type { Attestation } from '@/types/attestation'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Build a canister-signed attestation for testing. Uses a freshly generated
 * Ed25519 keypair and returns both the attestation and the public key.
 */
function makeSignedAttestation(
  overrides: Partial<Attestation> = {}
): { attestation: Attestation; publicKey: Uint8Array } {
  const privateKey = ed25519.utils.randomSecretKey()
  const publicKey = ed25519.getPublicKey(privateKey)

  const base: Attestation = {
    evmAddress: '0xCREATOR0000000000000000000000000000ABCD',
    chain: 'base',
    tokenAddress: '0xTOKEN00000000000000000000000000000ABCDE',
    threshold: 100,
    balanceAtCheck: 500,
    cidHash: 'a'.repeat(64),
    timestamp: Math.floor(Date.now() / 1000),
    signature: '',
  }
  const attestation: Attestation = { ...base, ...overrides }

  const preimage = `HAVEN_ATTEST_V1:${attestation.chain}:${attestation.tokenAddress}:${attestation.threshold}:${attestation.evmAddress}:${attestation.cidHash}:${attestation.timestamp}:${attestation.balanceAtCheck}`
  const sig = ed25519.sign(new TextEncoder().encode(preimage), privateKey)
  attestation.signature = bytesToHex(sig)

  return { attestation, publicKey }
}

// ---------------------------------------------------------------------------
// verifyAttestation: signature + TTL
// ---------------------------------------------------------------------------

describe('verifyAttestation', () => {
  it('accepts a fresh, validly-signed attestation', () => {
    const { attestation, publicKey } = makeSignedAttestation()
    expect(verifyAttestation(attestation, publicKey)).toBe(true)
  })

  it('rejects an expired attestation', () => {
    const oldTs = Math.floor(Date.now() / 1000) - 365 * 24 * 60 * 60
    const { attestation, publicKey } = makeSignedAttestation({ timestamp: oldTs })
    expect(verifyAttestation(attestation, publicKey)).toBe(false)
  })

  it('rejects when signed by a different canister key', () => {
    const { attestation } = makeSignedAttestation()
    const otherKey = ed25519.getPublicKey(ed25519.utils.randomSecretKey())
    expect(verifyAttestation(attestation, otherKey)).toBe(false)
  })

  it('rejects when a signed field is tampered with', () => {
    const { attestation, publicKey } = makeSignedAttestation()
    const tampered: Attestation = { ...attestation, threshold: 1 }
    expect(verifyAttestation(tampered, publicKey)).toBe(false)
  })

  it('rejects malformed hex signatures without throwing', () => {
    const { attestation, publicKey } = makeSignedAttestation()
    const bad: Attestation = { ...attestation, signature: 'not-hex-zzz' }
    expect(verifyAttestation(bad, publicKey)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// attestationMatchesEntity: the cross-binding / anti-replay check
// ---------------------------------------------------------------------------

describe('attestationMatchesEntity', () => {
  const creator = '0xCREATOR0000000000000000000000000000ABCD'
  const cidHashA = 'a'.repeat(64)
  const cidHashB = 'b'.repeat(64)

  function baseAttestation(): Attestation {
    return {
      evmAddress: creator,
      chain: 'base',
      tokenAddress: '0xTOKEN00000000000000000000000000000ABCDE',
      threshold: 100,
      balanceAtCheck: 500,
      cidHash: cidHashA,
      timestamp: Math.floor(Date.now() / 1000),
      signature: '00',
    }
  }

  function entityAttrs(over: Partial<Record<string, string | number>> = {}) {
    return {
      creator,
      attributes: {
        gate_token: '0xTOKEN00000000000000000000000000000ABCDE',
        gate_chain: 'base',
        gate_threshold: 100,
        cid_hash: cidHashA,
        ...over,
      } as {
        gate_token?: string
        gate_chain?: string
        gate_threshold?: number
        cid_hash?: string
      },
    }
  }

  it('accepts a matching attestation', () => {
    expect(attestationMatchesEntity(baseAttestation(), entityAttrs())).toBe(true)
  })

  // --- CROSS-POST REPLAY (the headline vulnerability) ---
  it('REJECTS replay: attestation from entity A attached to entity B (different cid_hash)', () => {
    const att = baseAttestation() // bound to cidHashA
    const entity = entityAttrs({ cid_hash: cidHashB })
    expect(attestationMatchesEntity(att, entity)).toBe(false)
  })

  it('REJECTS when entity has no cid_hash at all (fails closed)', () => {
    const att = baseAttestation()
    const entity = {
      creator,
      attributes: {
        gate_token: '0xTOKEN00000000000000000000000000000ABCDE',
        gate_chain: 'base',
        gate_threshold: 100,
        // cid_hash intentionally omitted
      },
    }
    expect(attestationMatchesEntity(att, entity)).toBe(false)
  })

  it('REJECTS when attestation cidHash is empty (fails closed)', () => {
    const att = { ...baseAttestation(), cidHash: '' }
    expect(attestationMatchesEntity(att, entityAttrs())).toBe(false)
  })

  // --- Creator misbinding ---
  it('rejects when attestation evmAddress does not match entity creator', () => {
    const att = baseAttestation()
    const entity = entityAttrs()
    entity.creator = '0xATTACKER000000000000000000000000000DEAD'
    expect(attestationMatchesEntity(att, entity)).toBe(false)
  })

  // --- Gate misbinding ---
  it('rejects when gate_token mismatches', () => {
    expect(
      attestationMatchesEntity(
        baseAttestation(),
        entityAttrs({ gate_token: '0xOTHERTOKEN0000000000000000000000000DEAD' })
      )
    ).toBe(false)
  })

  it('rejects when gate_chain mismatches', () => {
    expect(
      attestationMatchesEntity(
        baseAttestation(),
        entityAttrs({ gate_chain: 'ethereum' })
      )
    ).toBe(false)
  })

  it('rejects when gate_threshold mismatches (low-threshold attestation on high-threshold gate)', () => {
    const att = { ...baseAttestation(), threshold: 1 }
    expect(attestationMatchesEntity(att, entityAttrs({ gate_threshold: 1_000_000 }))).toBe(false)
  })

  it('rejects when entity has no gate_token / gate_chain / gate_threshold (fails closed)', () => {
    const att = baseAttestation()
    expect(
      attestationMatchesEntity(att, {
        creator,
        attributes: { cid_hash: cidHashA },
      })
    ).toBe(false)
  })

  it('is case-insensitive on hex addresses', () => {
    const att = { ...baseAttestation(), evmAddress: creator.toUpperCase() }
    const entity = entityAttrs()
    entity.creator = creator.toLowerCase()
    expect(attestationMatchesEntity(att, entity)).toBe(true)
  })
})
