/**
 * Tests for lib/attestation.ts
 *
 * Focus:
 *   1. `verifyAttestation` (single-CID) — signature, TTL, tampering, key swap.
 *   2. `verifyMerkleAttestation` (v2) — round-trip against the canonical
 *      fixtures committed in haven-aol/tests/fixtures/merkle-attest-vector-n*.
 *      A bad proof step, flipped side, swapped root, expired TTL, and
 *      tampered leaf field MUST all return false.
 *   3. `attestationMatchesEntity` — replay-resistance across both shapes.
 *   4. `isMerkleAttestation` — type guard discriminates correctly.
 *
 * Fixtures live alongside this file (`./fixtures/merkle-attest-vector-n*.json`)
 * and are byte-identical copies of the canister/CLI golden vectors. The
 * test signs the canonical batch preimage with a fresh Ed25519 keypair
 * (same pattern as the existing single-CID tests) so the dapp verifier
 * is exercised end-to-end without needing a live canister key.
 */

import { describe, it, expect } from 'vitest'
import { ed25519 } from '@noble/curves/ed25519.js'
import {
  verifyAttestation,
  verifyMerkleAttestation,
  attestationMatchesEntity,
} from '../attestation'
import {
  isMerkleAttestation,
  type Attestation,
  type MerkleAttestation,
  type MerkleProofEntry,
  type SingleAttestation,
} from '@/types/attestation'

import vectorN1 from './fixtures/merkle-attest-vector-n1.json'
import vectorN4 from './fixtures/merkle-attest-vector-n4.json'
import vectorN20 from './fixtures/merkle-attest-vector-n20.json'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Build a canister-signed single-CID attestation for testing. Uses a
 * freshly generated Ed25519 keypair and returns both the attestation and
 * the public key.
 */
function makeSignedAttestation(
  overrides: Partial<SingleAttestation> = {}
): { attestation: SingleAttestation; publicKey: Uint8Array } {
  const privateKey = ed25519.utils.randomSecretKey()
  const publicKey = ed25519.getPublicKey(privateKey)

  const base: SingleAttestation = {
    evmAddress: '0xCREATOR0000000000000000000000000000ABCD',
    chain: 'base',
    tokenAddress: '0xTOKEN00000000000000000000000000000ABCDE',
    threshold: 100,
    balanceAtCheck: 500,
    cidHash: 'a'.repeat(64),
    timestamp: Math.floor(Date.now() / 1000),
    signature: '',
  }
  const attestation: SingleAttestation = { ...base, ...overrides }

  const preimage = `HAVEN_ATTEST_V1:${attestation.chain}:${attestation.tokenAddress}:${attestation.threshold}:${attestation.evmAddress}:${attestation.cidHash}:${attestation.timestamp}:${attestation.balanceAtCheck}`
  const sig = ed25519.sign(new TextEncoder().encode(preimage), privateKey)
  attestation.signature = bytesToHex(sig)

  return { attestation, publicKey }
}

/**
 * Build one fully-formed, validly-signed `MerkleAttestation` for a chosen
 * leaf of the given canonical fixture. Uses a fresh Ed25519 keypair to
 * sign the canister's canonical batch preimage. Returns the public key
 * so the test can verify against it.
 *
 * The fixture itself is byte-identical to the canister/CLI golden vector;
 * if any of `merkleRoot`, `merkleProof`, `cidHash`, or the leaf preimage
 * format ever drifts between canister and dapp, the round-trip fails.
 */
function makeSignedMerkleAttestation(
  vector: typeof vectorN4,
  leafIndex: number,
  overrides: Partial<MerkleAttestation> = {}
): { attestation: MerkleAttestation; publicKey: Uint8Array } {
  const privateKey = ed25519.utils.randomSecretKey()
  const publicKey = ed25519.getPublicKey(privateKey)

  const leaf = vector.expected.leaves_submissionOrder[leafIndex]
  const preimage = vector.expected.batchPreimage_utf8

  const sig = ed25519.sign(new TextEncoder().encode(preimage), privateKey)

  const attestation: MerkleAttestation = {
    evmAddress: vector.input.evmAddress,
    chain: vector.input.chain,
    tokenAddress: vector.input.tokenAddress,
    threshold: vector.input.threshold,
    balanceAtCheck: vector.expected.balanceAtCheck,
    timestamp: vector.expected.timestamp,
    cidCount: vector.expected.cidCount,
    cidHash: leaf.cidHash,
    merkleProof: leaf.merkleProof as MerkleProofEntry[],
    merkleRoot: vector.expected.merkleRoot,
    rootSignature: bytesToHex(sig),
    ...overrides,
  }

  return { attestation, publicKey }
}

/**
 * Override the timestamp consistently across the canonical fixture: the
 * leaf preimage and batch preimage both depend on `timestamp`, so we
 * cannot just edit one field. Returns a new in-memory vector with the
 * timestamp swapped and re-derived `batchPreimage_utf8`. Per-leaf proofs
 * are NOT recomputed (verifier rebuilds the leaf hash from the new
 * timestamp anyway, but the cached merkleRoot would no longer match) —
 * so this helper is only used for the TTL test, which expects expiry to
 * short-circuit before any hash work happens.
 */
function vectorWithTimestamp(
  vector: typeof vectorN4,
  newTimestamp: number
): typeof vectorN4 {
  return {
    ...vector,
    expected: {
      ...vector.expected,
      timestamp: newTimestamp,
    },
  }
}

// ---------------------------------------------------------------------------
// verifyAttestation: signature + TTL (single-CID, unchanged behavior)
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
    const tampered: SingleAttestation = { ...attestation, threshold: 1 }
    expect(verifyAttestation(tampered, publicKey)).toBe(false)
  })

  it('rejects malformed hex signatures without throwing', () => {
    const { attestation, publicKey } = makeSignedAttestation()
    const bad: SingleAttestation = { ...attestation, signature: 'not-hex-zzz' }
    expect(verifyAttestation(bad, publicKey)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// verifyMerkleAttestation: v2 batch round-trip against canister fixtures
// ---------------------------------------------------------------------------

describe('verifyMerkleAttestation', () => {
  describe.each([
    { name: 'N=1', vector: vectorN1 as typeof vectorN4 },
    { name: 'N=4', vector: vectorN4 },
    { name: 'N=20', vector: vectorN20 as typeof vectorN4 },
  ])('fixture $name', ({ vector }) => {
    const cidCount = vector.expected.cidCount
    // The canonical fixtures have a fixed timestamp (1700000000 = Nov 2023);
    // pin `nowSeconds` to the fixture timestamp so TTL never fires for the
    // happy-path tests. TTL-rejection paths override `nowSeconds` explicitly.
    const fixtureNow = vector.expected.timestamp

    it('accepts every leaf in the batch', () => {
      for (let i = 0; i < cidCount; i++) {
        const { attestation, publicKey } = makeSignedMerkleAttestation(vector, i)
        expect(
          verifyMerkleAttestation(attestation, publicKey, { nowSeconds: fixtureNow }),
          `leaf ${i} of ${cidCount}`
        ).toBe(true)
      }
    })

    it('rejects when the root signature was made by a different canister key', () => {
      const { attestation } = makeSignedMerkleAttestation(vector, 0)
      const otherKey = ed25519.getPublicKey(ed25519.utils.randomSecretKey())
      expect(
        verifyMerkleAttestation(attestation, otherKey, { nowSeconds: fixtureNow })
      ).toBe(false)
    })

    it('rejects when the merkleRoot is swapped to an unrelated 32-byte value', () => {
      const { attestation, publicKey } = makeSignedMerkleAttestation(vector, 0)
      const tampered: MerkleAttestation = {
        ...attestation,
        merkleRoot: 'd'.repeat(64),
      }
      expect(
        verifyMerkleAttestation(tampered, publicKey, { nowSeconds: fixtureNow })
      ).toBe(false)
    })

    it('rejects when cidHash is changed (leaf no longer matches root)', () => {
      const { attestation, publicKey } = makeSignedMerkleAttestation(vector, 0)
      const tampered: MerkleAttestation = {
        ...attestation,
        cidHash: 'b'.repeat(64),
      }
      expect(
        verifyMerkleAttestation(tampered, publicKey, { nowSeconds: fixtureNow })
      ).toBe(false)
    })

    it('rejects when timestamp is changed (leaf preimage drifts)', () => {
      // `timestamp` is a small integer that's safe to mutate by ±1 (unlike
      // `balanceAtCheck` which is 5e18 in the fixtures and exceeds Number
      // precision when incremented). Both fields are part of the leaf
      // preimage, so tampering with either MUST break the proof walk.
      const { attestation, publicKey } = makeSignedMerkleAttestation(vector, 0)
      const tampered: MerkleAttestation = {
        ...attestation,
        timestamp: attestation.timestamp + 1,
      }
      expect(
        verifyMerkleAttestation(tampered, publicKey, { nowSeconds: fixtureNow })
      ).toBe(false)
    })

    if (cidCount > 1) {
      it('rejects when a single proof step has its sibling hash flipped', () => {
        const { attestation, publicKey } = makeSignedMerkleAttestation(vector, 0)
        // Flip first byte of the first proof step's hash
        const tamperedHash =
          (attestation.merkleProof[0]!.hash[0] === '0' ? 'f' : '0') +
          attestation.merkleProof[0]!.hash.slice(1)
        const tamperedProof = [
          { ...attestation.merkleProof[0]!, hash: tamperedHash },
          ...attestation.merkleProof.slice(1),
        ]
        const tampered: MerkleAttestation = {
          ...attestation,
          merkleProof: tamperedProof,
        }
        expect(
          verifyMerkleAttestation(tampered, publicKey, { nowSeconds: fixtureNow })
        ).toBe(false)
      })

      it('rejects when a proof step has its `side` label flipped', () => {
        const { attestation, publicKey } = makeSignedMerkleAttestation(vector, 0)
        const flipped: MerkleProofEntry = {
          ...attestation.merkleProof[0]!,
          side: attestation.merkleProof[0]!.side === 'left' ? 'right' : 'left',
        }
        const tampered: MerkleAttestation = {
          ...attestation,
          merkleProof: [flipped, ...attestation.merkleProof.slice(1)],
        }
        expect(
          verifyMerkleAttestation(tampered, publicKey, { nowSeconds: fixtureNow })
        ).toBe(false)
      })
    }

    it('rejects an expired attestation (TTL short-circuits before hashing)', () => {
      // Use a timestamp 365 days after the attestation — verifier should reject
      // on TTL alone, never reaching the proof walk.
      const { attestation, publicKey } = makeSignedMerkleAttestation(vector, 0)
      const farFuture = attestation.timestamp + 365 * 24 * 60 * 60
      expect(
        verifyMerkleAttestation(attestation, publicKey, { nowSeconds: farFuture })
      ).toBe(false)
    })

    it('rejects malformed hex in rootSignature without throwing', () => {
      const { attestation, publicKey } = makeSignedMerkleAttestation(vector, 0, {
        rootSignature: 'not-hex-zzzz',
      })
      expect(
        verifyMerkleAttestation(attestation, publicKey, { nowSeconds: fixtureNow })
      ).toBe(false)
    })

    it('rejects when merkleRoot is the wrong length', () => {
      const { attestation, publicKey } = makeSignedMerkleAttestation(vector, 0, {
        merkleRoot: 'ab'.repeat(31), // 62 chars = 31 bytes
      })
      expect(
        verifyMerkleAttestation(attestation, publicKey, { nowSeconds: fixtureNow })
      ).toBe(false)
    })
  })

  // Smoke test for the TTL helper above — proves the test fixture covers
  // both the `nowSeconds` override and the absolute-timestamp form.
  it('rejects expired attestation against the system clock', () => {
    const expired = vectorWithTimestamp(vectorN1 as typeof vectorN4, 1)
    const { attestation, publicKey } = makeSignedMerkleAttestation(expired, 0)
    // The signed batch preimage no longer matches because the timestamp
    // baked into batchPreimage_utf8 was not regenerated, but we don't even
    // get that far — TTL fails first.
    expect(verifyMerkleAttestation(attestation, publicKey)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isMerkleAttestation: type guard discrimination
// ---------------------------------------------------------------------------

describe('isMerkleAttestation', () => {
  it('returns true for a v2 Merkle attestation', () => {
    const { attestation } = makeSignedMerkleAttestation(vectorN4, 0)
    expect(isMerkleAttestation(attestation)).toBe(true)
  })

  it('returns false for a single-CID attestation', () => {
    const { attestation } = makeSignedAttestation()
    expect(isMerkleAttestation(attestation)).toBe(false)
  })

  it('narrows the type correctly inside a guarded branch', () => {
    const { attestation } = makeSignedMerkleAttestation(vectorN4, 0)
    const wider: Attestation = attestation
    if (isMerkleAttestation(wider)) {
      // TS now narrows to MerkleAttestation; this access must compile.
      expect(typeof wider.merkleRoot).toBe('string')
      expect(Array.isArray(wider.merkleProof)).toBe(true)
    } else {
      // Should be unreachable for this fixture.
      expect.fail('isMerkleAttestation returned false for a Merkle attestation')
    }
  })
})

// ---------------------------------------------------------------------------
// attestationMatchesEntity: the cross-binding / anti-replay check
// ---------------------------------------------------------------------------

describe('attestationMatchesEntity', () => {
  const creator = '0xCREATOR0000000000000000000000000000ABCD'
  const cidHashA = 'a'.repeat(64)
  const cidHashB = 'b'.repeat(64)

  function baseAttestation(): SingleAttestation {
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

  // --- Same matrix on a MerkleAttestation: union signature must accept both ---
  describe('MerkleAttestation cross-checks (union-typed args)', () => {
    function baseMerkle(): MerkleAttestation {
      return {
        evmAddress: creator,
        chain: 'base',
        tokenAddress: '0xTOKEN00000000000000000000000000000ABCDE',
        threshold: 100,
        balanceAtCheck: 500,
        cidHash: cidHashA,
        timestamp: Math.floor(Date.now() / 1000),
        cidCount: 4,
        merkleRoot: '0'.repeat(64),
        merkleProof: [],
        rootSignature: '0'.repeat(128),
      }
    }

    it('accepts a matching MerkleAttestation', () => {
      expect(attestationMatchesEntity(baseMerkle(), entityAttrs())).toBe(true)
    })

    it('REJECTS replay: MerkleAttestation bound to cidHashA on entity with cidHashB', () => {
      expect(
        attestationMatchesEntity(baseMerkle(), entityAttrs({ cid_hash: cidHashB }))
      ).toBe(false)
    })

    it('rejects MerkleAttestation when threshold mismatches the gate', () => {
      const att = { ...baseMerkle(), threshold: 1 }
      expect(
        attestationMatchesEntity(att, entityAttrs({ gate_threshold: 1_000_000 }))
      ).toBe(false)
    })
  })
})
