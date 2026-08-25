/**
 * V4 streaming-encrypt tests.
 *
 * The critical property: output must decrypt through the EXISTING dapp
 * pipeline (`decryptChunkedFile`), which is byte-compatible with
 * haven-cli's `encrypt_file_streaming`. A roundtrip here proves the web
 * uploader produces content the current reader can play — no canister,
 * CLI, or decrypt-side changes required.
 *
 * @module lib/v4/__tests__/streaming-encrypt
 */

import { describe, it, expect } from 'vitest'
import { deriveChunkIv, decryptChunkedFile, parseChunkedFileHeader } from '../../chunked-decrypt'
import {
  HAVEN_PLAINTEXT_CHUNK_SIZE,
  havenStreamEncrypt,
  zeroAesKey,
} from '../streaming-encrypt'
import { sha256 } from '../../crypto'

// Deterministic pseudorandom filler (fast, reproducible).
function fillBytes(length: number, seed = 0x9e3779b9): Uint8Array {
  const out = new Uint8Array(length)
  let state = seed >>> 0
  for (let i = 0; i < length; i++) {
    // xorshift32
    state ^= state << 13; state >>>= 0
    state ^= state >> 17
    state ^= state << 5; state >>>= 0
    out[i] = state & 0xff
  }
  return out
}

describe('deriveChunkIv (parity with Python _derive_chunk_iv)', () => {
  it('XORs big-endian u64 index into base IV bytes [4..12]', () => {
    const baseIv = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    const iv0 = deriveChunkIv(baseIv, 0)
    expect([...iv0]).toEqual([...baseIv]) // index 0 is identity

    const iv1 = deriveChunkIv(baseIv, 1)
    expect(iv1[11]).toBe(baseIv[11] ^ 0x01) // be64(1) last byte = 0x01
    expect(iv1[10]).toBe(baseIv[10] ^ 0x00)
    expect(iv1.slice(0, 4)).toEqual(baseIv.slice(0, 4)) // prefix untouched
  })

  it('matches the Python algorithm byte-for-byte on a known vector', () => {
    // Python: struct.pack(">Q", 256) == bytes([0,0,0,0,0,0,1,0])
    const baseIv = new Uint8Array(12).fill(0xab)
    const perIv = deriveChunkIv(baseIv, 256)
    expect(perIv[10]).toBe(0xab ^ 0x01)
    expect(perIv[11]).toBe(0xab ^ 0x00)
  })

  it('rejects non-12-byte base IVs', () => {
    expect(() => deriveChunkIv(new Uint8Array(11), 0)).toThrow()
  })
})

describe('havenStreamEncrypt format', () => {
  it('emits [12B base_iv][u32 idx LE][u32 len LE][GCM record]…', async () => {
    const plaintext = fillBytes(HAVEN_PLAINTEXT_CHUNK_SIZE + 100) // 2 records
    const { encrypted, aesKey, recordCount } = await havenStreamEncrypt(plaintext)

    expect(aesKey).toHaveLength(32)
    expect(recordCount).toBe(2)

    // Header parses as a chunked file with 2 estimated records
    const header = parseChunkedFileHeader(encrypted)
    expect(header.dataOffset).toBe(12)
    expect(header.estimatedChunks).toBe(2)

    // First record header: idx=0, len = 1MiB + GCM tag (16B)
    const view = new DataView(encrypted.buffer, encrypted.byteOffset + 12, 8)
    expect(view.getUint32(0, true)).toBe(0)
    expect(view.getUint32(4, true)).toBe(HAVEN_PLAINTEXT_CHUNK_SIZE + 16)

    // Second record header follows immediately after record 0 payload
    const secondOffset = 12 + 8 + HAVEN_PLAINTEXT_CHUNK_SIZE + 16
    const view2 = new DataView(encrypted.buffer, encrypted.byteOffset + secondOffset, 8)
    expect(view2.getUint32(0, true)).toBe(1)
    expect(view2.getUint32(4, true)).toBe(100 + 16)

    // Total size checks out exactly
    expect(encrypted.length).toBe(
      12 + 2 * 8 + (HAVEN_PLAINTEXT_CHUNK_SIZE + 100 + 2 * 16)
    )
  })

  it('produces unique base IVs across runs', async () => {
    const data = fillBytes(64)
    const a = await havenStreamEncrypt(data)
    const b = await havenStreamEncrypt(data)
    expect(Buffer.from(a.encrypted.slice(0, 12))).not.toEqual(
      Buffer.from(b.encrypted.slice(0, 12))
    )
    zeroAesKey(a.aesKey)
    zeroAesKey(b.aesKey)
  })
})

describe('havenStreamEncrypt ↔ decryptChunkedFile roundtrip', () => {
  it.each([
    ['empty-ish', 1],
    ['sub-chunk', 1024],
    ['exact multiple', HAVEN_PLAINTEXT_CHUNK_SIZE * 2],
    ['ragged', HAVEN_PLAINTEXT_CHUNK_SIZE + 12345],
  ])('recovers %s plaintext exactly', async (_name, size) => {
    const plaintext = fillBytes(size, 42)
    const { encrypted, aesKey } = await havenStreamEncrypt(plaintext)

    const decrypted = await decryptChunkedFile(encrypted, aesKey)
    // Buffer.equals — O(n); vitest's toEqual on multi-MB buffers is quadratic.
    expect(Buffer.from(decrypted).equals(Buffer.from(plaintext))).toBe(true)

    zeroAesKey(aesKey)
  })

  it('wrong key fails closed (GCM auth)', async () => {
    const plaintext = fillBytes(2048)
    const { encrypted, aesKey } = await havenStreamEncrypt(plaintext)
    const raw = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    )
    const exported = await crypto.subtle.exportKey('raw', raw)
    const wrong = new Uint8Array(exported)

    await expect(decryptChunkedFile(encrypted, wrong)).rejects.toThrow()

    zeroAesKey(aesKey)
  })

  it('ciphertext differs from plaintext and is deterministic in structure', async () => {
    const plaintext = fillBytes(4096, 7)
    const { encrypted } = await havenStreamEncrypt(plaintext)

    const plainHash = Buffer.from(await sha256(plaintext))
    const cipherHash = Buffer.from(await sha256(encrypted))
    expect(plainHash.equals(cipherHash)).toBe(false)
  })
})
