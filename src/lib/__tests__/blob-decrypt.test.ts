/**
 * Round-trip tests for single-blob seal decrypt (the Herald/aol_seal
 * `[IV][ciphertext+tag]` layout) and the chunked/single dispatcher.
 *
 * Vectors are sealed live with WebCrypto AES-GCM (the same primitive the
 * SDK decrypts with), so the suite pins the layout contract, not canned
 * bytes: 12-byte IV prefix, GCM auth enforced, dispatcher routing by the
 * chunked heuristic.
 *
 * @module lib/__tests__/blob-decrypt.test
 */

import { describe, expect, it } from 'vitest'
import { decryptSingleBlob, decryptToPlaintext } from '../blob-decrypt'

async function sealSingleBlob(plaintext: Uint8Array): Promise<{ sealed: Uint8Array; key: Uint8Array }> {
  const key = crypto.getRandomValues(new Uint8Array(32))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cryptoKey = await crypto.subtle.importKey('raw', key as BufferSource, 'AES-GCM', false, ['encrypt'])
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, cryptoKey, plaintext as BufferSource))
  const sealed = new Uint8Array(12 + ct.length)
  sealed.set(iv, 0)
  sealed.set(ct, 12)
  return { sealed, key }
}

describe('decryptSingleBlob', () => {
  it('opens a WebCrypto-sealed blob byte-identically', async () => {
    const plaintext = new TextEncoder().encode('sweet leaf '.repeat(200))
    const { sealed, key } = await sealSingleBlob(plaintext)
    await expect(decryptSingleBlob(sealed, key)).resolves.toEqual(plaintext)
  })

  it('fails loud on tampered bytes (GCM auth)', async () => {
    const { sealed, key } = await sealSingleBlob(new TextEncoder().encode('x'.repeat(64)))
    sealed[sealed.length - 1]! ^= 0xff
    await expect(decryptSingleBlob(sealed, key)).rejects.toThrow()
  })

  it('fails loud on a truncated blob', async () => {
    const { sealed, key } = await sealSingleBlob(new TextEncoder().encode('x'.repeat(64)))
    await expect(decryptSingleBlob(sealed.slice(0, 8), key)).rejects.toThrow()
  })
})

describe('decryptToPlaintext', () => {
  it('routes single-blob seals to the single-blob path', async () => {
    const plaintext = new TextEncoder().encode('after forever '.repeat(100))
    const { sealed, key } = await sealSingleBlob(plaintext)
    await expect(decryptToPlaintext(sealed, key)).resolves.toEqual(plaintext)
  })
})
