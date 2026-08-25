/**
 * V4 streaming encryption — browser port of haven-cli's
 * `encrypt_file_streaming()` (haven_cli/crypto/haven_aol_local.py).
 *
 * Produces the EXACT byte format the dapp's `chunked-decrypt.ts` already
 * plays back, so V4 chunks decrypt through the existing pipeline unchanged:
 *
 * ```
 * [12-byte base_iv]
 * [4-byte chunk_index LE][4-byte chunk_length LE][AES-256-GCM(chunk)]
 * ...
 * ```
 *
 * Per-subchunk IV derivation matches Python `_derive_chunk_iv()`: XOR the
 * big-endian u64 subchunk index into bytes [4..12] of the base IV. The
 * derivation helper is imported from `chunked-decrypt.ts` so both sides of
 * the format share one implementation.
 *
 * @module lib/v4/streaming-encrypt
 */

import { generateAESKey, generateIV } from '../crypto'
import { deriveChunkIv, concatenateChunks } from '../chunked-decrypt'

// ============================================================================
// Constants (must match chunked-decrypt.ts / haven_aol_local.py)
// ============================================================================

/** Plaintext bytes per GCM record — same default as haven-cli (1 MiB). */
export const HAVEN_PLAINTEXT_CHUNK_SIZE = 1024 * 1024

const CHUNK_HEADER_SIZE = 8
const BASE_IV_SIZE = 12

/** Hard cap on input size for one drip chunk slice (2 GiB). */
const MAX_SLICE_BYTES = 2 * 1024 * 1024 * 1024

// ============================================================================
// Types
// ============================================================================

export interface HavenStreamEncryptOptions {
  /** Plaintext subchunk size. Defaults to 1 MiB (haven-cli default). */
  plaintextChunkSize?: number
  /**
   * Progress callback after each encrypted record:
   * (recordsDone, recordsTotal, plaintextBytesProcessed).
   */
  onProgress?: (done: number, total: number, bytesProcessed: number) => void
  /** Abort signal — checked between records. */
  signal?: AbortSignal
}

export interface HavenStreamEncryptResult {
  /**
   * Encrypted blob in haven-cli chunked format, ready to pin to Filecoin.
   * Layout: [12B base_iv][u32 idx][u32 len][GCM]…
   */
  encrypted: Uint8Array
  /** The fresh 256-bit AES content key (caller must IBE-wrap + then zero). */
  aesKey: Uint8Array
  /** Number of GCM records written. */
  recordCount: number
}

// ============================================================================
// Core
// ============================================================================

/**
 * Stream-encrypt a plaintext byte slice into haven-cli chunked format with a
 * freshly generated AES-256-GCM key and random 12-byte base IV.
 *
 * Records are written sequentially; each is independently verifiable by the
 * standard dapp decrypt path (`decryptChunkedFile` / progressive playback).
 */
export async function havenStreamEncrypt(
  plaintext: Uint8Array,
  options: HavenStreamEncryptOptions = {}
): Promise<HavenStreamEncryptResult> {
  if (plaintext.length > MAX_SLICE_BYTES) {
    throw new Error(
      `Drip slice too large: ${plaintext.length} bytes exceeds ${MAX_SLICE_BYTES}-byte limit`
    )
  }

  const recordSize = options.plaintextChunkSize ?? HAVEN_PLAINTEXT_CHUNK_SIZE
  if (!Number.isInteger(recordSize) || recordSize <= 0 || recordSize > 64 * 1024 * 1024) {
    throw new Error(`Invalid plaintextChunkSize: ${recordSize}`)
  }

  const totalRecords = Math.max(1, Math.ceil(plaintext.length / recordSize))
  const aesKey = await generateAESKey()
  const baseIv = generateIV()

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    aesKey as BufferSource,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  )

  const header = new Uint8Array(BASE_IV_SIZE)
  header.set(baseIv)

  const parts: Uint8Array[] = [header]
  let done = 0
  let bytesProcessed = 0

  for (let index = 0; index < totalRecords; index++) {
    if (options.signal?.aborted) {
      throw new DOMException('Encryption cancelled', 'AbortError')
    }

    const start = index * recordSize
    const end = Math.min(start + recordSize, plaintext.length)
    const slice = plaintext.subarray(start, end)
    const perIv = deriveChunkIv(baseIv, index)

    const cipherBuf = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: perIv as BufferSource },
      cryptoKey,
      slice as BufferSource
    )
    const record = new Uint8Array(cipherBuf)

    const recordHeader = new Uint8Array(CHUNK_HEADER_SIZE)
    const view = new DataView(recordHeader.buffer)
    view.setUint32(0, index, true) // little-endian, matches Python struct.pack("<I")
    view.setUint32(4, record.byteLength, true)

    parts.push(recordHeader, record)

    done += 1
    bytesProcessed += slice.byteLength
    options.onProgress?.(done, totalRecords, bytesProcessed)
  }

  return { encrypted: concatenateChunks(parts), aesKey, recordCount: done }
}

/**
 * Best-effort zeroization of an AES key after it has been IBE-wrapped.
 * JS cannot guarantee collection, but clearing the backing store narrows the
 * window consistent with the rest of the codebase's secureClear usage.
 */
export function zeroAesKey(key: Uint8Array): void {
  key.fill(0)
}
