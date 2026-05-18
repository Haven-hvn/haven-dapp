import { describe, expect, it } from 'vitest'
import {
  EncryptedPayloadError,
  extractHavenEncryptedPayload,
  findHavenChunkedEncryptOffset,
  looksLikeHavenChunkedEncryptAt,
} from '../encrypted-payload'

function buildChunkedPayload(chunkPlaintextLen: number): Uint8Array {
  const encryptedChunkLen = chunkPlaintextLen + 16
  const total = 12 + 8 + encryptedChunkLen
  const buf = new Uint8Array(total)
  buf.set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 0)
  const view = new DataView(buf.buffer)
  view.setUint32(12, 0, true)
  view.setUint32(16, encryptedChunkLen, true)
  return buf
}

describe('looksLikeHavenChunkedEncryptAt', () => {
  it('accepts valid chunk 0 at offset 0', () => {
    const payload = buildChunkedPayload(1024)
    expect(looksLikeHavenChunkedEncryptAt(payload, 0)).toBe(true)
  })

  it('rejects MP4-like bytes at offset 0', () => {
    const mp4 = new Uint8Array(32)
    mp4[4] = 0x66
    mp4[5] = 0x74
    mp4[6] = 0x79
    mp4[7] = 0x70
    expect(looksLikeHavenChunkedEncryptAt(mp4, 0)).toBe(false)
  })
})

describe('extractHavenEncryptedPayload', () => {
  it('returns payload unchanged when already raw encrypted', () => {
    const payload = buildChunkedPayload(512)
    const out = extractHavenEncryptedPayload(payload)
    expect(out).toBe(payload)
  })

  it('finds payload embedded after CAR-like prefix', () => {
    const payload = buildChunkedPayload(256)
    const carLike = new Uint8Array(200 + payload.length)
    carLike.fill(0xab, 0, 200)
    carLike.set(payload, 200)
    const out = extractHavenEncryptedPayload(carLike)
    expect(out.byteLength).toBe(payload.byteLength)
    expect(out[0]).toBe(1)
    expect(findHavenChunkedEncryptOffset(carLike)).toBe(200)
  })

  it('throws when no valid header exists', () => {
    const garbage = new Uint8Array(256)
    garbage.fill(0xff)
    expect(() => extractHavenEncryptedPayload(garbage)).toThrow(EncryptedPayloadError)
  })
})
