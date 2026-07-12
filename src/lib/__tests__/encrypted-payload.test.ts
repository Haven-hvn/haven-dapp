import { describe, expect, it } from 'vitest'
import {
  EncryptedPayloadError,
  extractHavenEncryptedPayload,
  looksLikeHavenChunkedEncryptAt,
  looksLikeHavenChunkedEncryptStrict,
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

function buildTwoChunkPayload(): Uint8Array {
  const chunk0Enc = 256 + 16
  const chunk1Enc = 128 + 16
  const total = 12 + 8 + chunk0Enc + 8 + chunk1Enc
  const buf = new Uint8Array(total)
  buf.fill(7, 0, 12)
  const view = new DataView(buf.buffer)
  let off = 12
  view.setUint32(off, 0, true)
  view.setUint32(off + 4, chunk0Enc, true)
  off += 8 + chunk0Enc
  view.setUint32(off, 1, true)
  view.setUint32(off + 4, chunk1Enc, true)
  return buf
}

describe('looksLikeHavenChunkedEncryptStrict', () => {
  it('accepts single-chunk payload at offset 0', () => {
    const payload = buildChunkedPayload(1024)
    expect(looksLikeHavenChunkedEncryptStrict(payload, 0)).toBe(true)
  })

  it('accepts two-chunk payload at offset 0', () => {
    expect(looksLikeHavenChunkedEncryptStrict(buildTwoChunkPayload(), 0)).toBe(true)
  })

  it('rejects false positive with chunk 0 but no following chunk 1', () => {
    const fake = new Uint8Array(20_000)
    fake.fill(0)
    const view = new DataView(fake.buffer)
    view.setUint32(12, 0, true)
    view.setUint32(16, 5000, true)
    expect(looksLikeHavenChunkedEncryptAt(fake, 0)).toBe(true)
    expect(looksLikeHavenChunkedEncryptStrict(fake, 0)).toBe(false)
  })
})

describe('extractHavenEncryptedPayload', () => {
  it('returns payload unchanged when already raw encrypted', async () => {
    const payload = buildChunkedPayload(512)
    const out = await extractHavenEncryptedPayload(payload)
    expect(out).toBe(payload)
  })

  it('throws when no valid header exists', async () => {
    const garbage = new Uint8Array(256)
    garbage.fill(0xff)
    await expect(extractHavenEncryptedPayload(garbage)).rejects.toThrow(
      EncryptedPayloadError
    )
  })
})
