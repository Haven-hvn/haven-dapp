/**
 * Locate haven-cli chunked ciphertext inside Synapse / FilBeam downloads.
 *
 * Uploads are wrapped as UnixFS inside a CAR; the piece GET returns the CAR
 * bytes, not the raw `{video}.encrypted` file. This module extracts the leaf
 * block that contains streaming-encrypt data before chunked decryption.
 *
 * @module lib/encrypted-payload
 */

import { CarReader } from '@ipld/car'

const BASE_IV_SIZE = 12
const CHUNK_HEADER_SIZE = 8
const GCM_TAG_MIN = 17
const MAX_CHUNK_SIZE = 64 * 1024 * 1024
const DEFAULT_PLAINTEXT_CHUNK = 1024 * 1024

/** How far into a linear CAR byte stream to scan (fallback only). */
const CAR_SCAN_LIMIT_BYTES = 16 * 1024 * 1024

export class EncryptedPayloadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EncryptedPayloadError'
  }
}

/**
 * True when `offset` points at haven-cli streaming format (base IV + chunk 0).
 */
export function looksLikeHavenChunkedEncryptAt(
  data: Uint8Array,
  offset: number
): boolean {
  const headerStart = offset + BASE_IV_SIZE
  if (headerStart + CHUNK_HEADER_SIZE + GCM_TAG_MIN > data.length) {
    return false
  }

  const view = new DataView(
    data.buffer,
    data.byteOffset + headerStart,
    CHUNK_HEADER_SIZE
  )
  const chunkIndex = view.getUint32(0, true)
  const chunkLength = view.getUint32(4, true)

  if (chunkIndex !== 0) {
    return false
  }
  if (chunkLength < GCM_TAG_MIN || chunkLength > MAX_CHUNK_SIZE) {
    return false
  }

  const chunkEnd = headerStart + CHUNK_HEADER_SIZE + chunkLength
  return chunkEnd <= data.length
}

/**
 * Stricter check: valid chunk 0 and, when more data follows, a plausible chunk 1.
 * Reduces false positives inside CAR/DAG bytes.
 */
export function looksLikeHavenChunkedEncryptStrict(
  data: Uint8Array,
  offset: number
): boolean {
  if (!looksLikeHavenChunkedEncryptAt(data, offset)) {
    return false
  }

  const headerStart = offset + BASE_IV_SIZE
  const view = new DataView(
    data.buffer,
    data.byteOffset + headerStart,
    CHUNK_HEADER_SIZE
  )
  const chunkLength = view.getUint32(4, true)
  const chunkEnd = headerStart + CHUNK_HEADER_SIZE + chunkLength

  if (chunkEnd === data.length) {
    return true
  }

  if (chunkEnd + CHUNK_HEADER_SIZE + GCM_TAG_MIN > data.length) {
    return false
  }

  const next = new DataView(
    data.buffer,
    data.byteOffset + chunkEnd,
    CHUNK_HEADER_SIZE
  )
  const nextIndex = next.getUint32(0, true)
  const nextLength = next.getUint32(4, true)

  return (
    nextIndex === 1 &&
    nextLength >= GCM_TAG_MIN &&
    nextLength <= MAX_CHUNK_SIZE &&
    chunkEnd + CHUNK_HEADER_SIZE + nextLength <= data.length
  )
}

/**
 * Find byte offset of haven-cli chunked ciphertext inside a larger buffer (fallback).
 */
export function findHavenChunkedEncryptOffset(data: Uint8Array): number | null {
  if (looksLikeHavenChunkedEncryptStrict(data, 0)) {
    return 0
  }

  const scanEnd = Math.min(
    data.length - BASE_IV_SIZE - CHUNK_HEADER_SIZE - GCM_TAG_MIN,
    CAR_SCAN_LIMIT_BYTES
  )
  for (let offset = 1; offset < scanEnd; offset++) {
    if (looksLikeHavenChunkedEncryptStrict(data, offset)) {
      return offset
    }
  }

  return null
}

async function extractFromCarBlocks(carBytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    const reader = await CarReader.fromBytes(carBytes)
    let best: Uint8Array | null = null

    for await (const block of reader.blocks()) {
      const bytes = block.bytes
      if (!bytes || bytes.length < BASE_IV_SIZE + CHUNK_HEADER_SIZE + GCM_TAG_MIN) {
        continue
      }
      if (looksLikeHavenChunkedEncryptStrict(bytes, 0)) {
        if (best == null || bytes.length > best.length) {
          best = bytes
        }
      }
    }

    return best
  } catch {
    return null
  }
}

/**
 * Strip CAR / wrapper bytes and return raw haven-cli `.encrypted` payload.
 */
export async function extractHavenEncryptedPayload(
  downloaded: Uint8Array
): Promise<Uint8Array> {
  if (downloaded.length < BASE_IV_SIZE + CHUNK_HEADER_SIZE + GCM_TAG_MIN) {
    throw new EncryptedPayloadError(
      `Downloaded object is too small (${downloaded.length} bytes) to be a haven encrypted video.`
    )
  }

  if (looksLikeHavenChunkedEncryptStrict(downloaded, 0)) {
    return downloaded
  }

  const fromCarBlock = await extractFromCarBlocks(downloaded)
  if (fromCarBlock != null) {
    return fromCarBlock
  }

  const offset = findHavenChunkedEncryptOffset(downloaded)
  if (offset != null) {
    return downloaded.subarray(offset)
  }

  const looksLikeMp4 =
    downloaded.length > 8 &&
    downloaded[4] === 0x66 &&
    downloaded[5] === 0x74 &&
    downloaded[6] === 0x79 &&
    downloaded[7] === 0x70

  if (looksLikeMp4) {
    throw new EncryptedPayloadError(
      'Downloaded bytes look like a plain MP4 (ftyp), not haven encrypted content. ' +
        'Check that the video is marked encrypted on Arkiv and was uploaded with encryption enabled.'
    )
  }

  throw new EncryptedPayloadError(
    'Could not extract haven-cli encrypted content from the Filecoin download. ' +
      'The piece is likely a UnixFS CAR; no valid encrypted chunk stream was found in its blocks. ' +
      'Re-upload with the current haven-cli.'
  )
}

/**
 * Rough expected plaintext size from encrypted payload (for progress UI).
 */
export function estimatePlaintextBytes(encrypted: Uint8Array): number {
  const dataSize = Math.max(0, encrypted.length - BASE_IV_SIZE)
  const avgEncryptedChunk =
    DEFAULT_PLAINTEXT_CHUNK + 16 + CHUNK_HEADER_SIZE
  const chunks = Math.max(1, Math.ceil(dataSize / avgEncryptedChunk))
  return Math.max(0, dataSize - chunks * (CHUNK_HEADER_SIZE + 16))
}
