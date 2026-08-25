/**
 * V4 IBE wrap tests — offline, no canister required.
 *
 * Uses the pocket-IC master public key to derive a real BLS12-381 dpk so
 * `wrapAesKeyWithDpk` performs genuine IBE encryption (the ciphertext is a
 * well-formed `IbeCiphertext` of the exact expected size). Full decryption
 * requires the subnet secret key and therefore stays on the canister path.
 *
 * Also pins the v1 derivation preimage — the identity every reader must
 * reconstruct from Arkiv metadata to request the chunk key.
 *
 * @module lib/v4/__tests__/ibe-wrap
 */

import { describe, it, expect } from 'vitest'
import { sha256 as nobleSha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'

import { DerivedPublicKey, MasterPublicKey, IbeCiphertext } from '@icp-sdk/vetkeys'
import {
  computeDripDerivationInput,
  clearDerivedPublicKeyCache,
  wrapAesKeyWithDpk,
} from '../ibe-wrap'

clearDerivedPublicKeyCache()

/** @noble/hashes v2: sha256(bytes) directly (no string shorthand). */
function sha256Of(text: string): Uint8Array {
  return nobleSha256(new TextEncoder().encode(text))
}

const POCKET_IC_CANISTER_ID_BYTES = new Uint8Array([
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0x01, 0x01,
])

function offlineDpk(): DerivedPublicKey {
  return MasterPublicKey.pocketicKey().deriveCanisterKey(POCKET_IC_CANISTER_ID_BYTES)
}

describe('computeDripDerivationInput', () => {
  it('pins the v4 preimage exactly (cross-stack fixture vector)', async () => {
    const gate = {
      chain: 'BaseMainnet' as const,
      tokenAddress: '0xAa70bC79fD1cB4a6FBA717018351F0C3c64B79Df',
      threshold: 5n,
      epoch: 670n,
      marketCapTarget: 5_000_000n,
      cid: 'bafybeiabc123', // informational in v4; not part of the preimage
    }

    const input = await computeDripDerivationInput(gate)

    // Vector `standard-base-mainnet-drip-chunk` from
    // haven-aol tests/fixtures/derivation-v4-vectors.json — the SAME file
    // the Motoko canister and Python SDK are pinned against.
    const expectedPreimage =
      'accessol_v4:BaseMainnet:0xAa70bC79fD1cB4a6FBA717018351F0C3c64B79Df:5:670:5000000'
    // Independent SHA-256 implementation (@noble) vs WebCrypto inside SDK.
    const expected = bytesToHex(sha256Of(expectedPreimage))
    expect(Buffer.from(input).toString('hex')).toBe(expected)
  })

  it('differs when the market-cap target differs (per-chunk key separation)', async () => {
    const base = {
      chain: 'EthMainnet' as const,
      tokenAddress: '0x0000000000000000000000000000000000000001',
      threshold: 3n,
      epoch: 670n,
      cid: 'same-cid',
    }
    const a = await computeDripDerivationInput({ ...base, marketCapTarget: 1_000_000n })
    const b = await computeDripDerivationInput({ ...base, marketCapTarget: 10_000_000n })
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false)
  })
})

describe('wrapAesKeyWithDpk (real IBE, offline dpk)', () => {
  it('wraps a 32-byte key into a deserializable IbeCiphertext', () => {
    const aesKey = new Uint8Array(32).fill(0x42)
    const identity = sha256Of("accessol:test")
    const dpk = offlineDpk()

    const b64 = wrapAesKeyWithDpk(aesKey, identity, dpk)

    expect(b64).toMatch(/^[A-Za-z0-9+/]+={0,2}$/)

    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    // IbeCiphertext.ciphertextSize(plaintextSize) is authoritative for length.
    expect(bytes.length).toBe(IbeCiphertext.ciphertextSize(aesKey.length))

    // Must round-trip through deserialize (structural validity).
    expect(() => IbeCiphertext.deserialize(bytes)).not.toThrow()
  })

  it('refuses non-32-byte keys', () => {
    const dpk = offlineDpk()
    expect(() =>
      wrapAesKeyWithDpk(new Uint8Array(16), sha256Of("x"), dpk)
    ).toThrow(/32 bytes/)
  })

  it('is randomized per call (fresh seed → distinct ciphertexts)', () => {
    const aesKey = new Uint8Array(32).fill(7)
    const identity = sha256Of("accessol:test")
    const dpk = offlineDpk()

    const a = wrapAesKeyWithDpk(aesKey, identity, dpk)
    const b = wrapAesKeyWithDpk(aesKey, identity, dpk)
    expect(a).not.toBe(b)
  })
})
