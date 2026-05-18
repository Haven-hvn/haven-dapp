/**
 * Locate haven-cli chunked ciphertext inside Synapse / FilBeam downloads.
 *
 * Uploads are wrapped as UnixFS inside a CAR; the piece GET returns the CAR
 * bytes, not the raw `{video}.encrypted` file. This module finds the embedded
 * streaming-encrypt payload before chunked decryption.
 *
 * @module lib/encrypted-payload
 */

const BASE_IV_SIZE = 12
const CHUNK_HEADER_SIZE = 8
const GCM_TAG_MIN = 17
const MAX_CHUNK_SIZE = 64 * 1024 * 1024
const DEFAULT_PLAINTEXT_CHUNK = 1024 * 1024

/** How far into a CAR to scan for the haven chunked header (chunk index 0). */
const CAR_SCAN_LIMIT_BYTES = 8 * 1024 * 1024

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
 * Find byte offset of haven-cli chunked ciphertext inside a larger buffer.
 */
export function findHavenChunkedEncryptOffset(data: Uint8Array): number | null {
  if (looksLikeHavenChunkedEncryptAt(data, 0)) {
    return 0
  }

  const scanEnd = Math.min(data.length - BASE_IV_SIZE - CHUNK_HEADER_SIZE - GCM_TAG_MIN, CAR_SCAN_LIMIT_BYTES)
  for (let offset = 1; offset < scanEnd; offset++) {
    if (looksLikeHavenChunkedEncryptAt(data, offset)) {
      return offset
    }
  }

  return null
}

/**
 * Strip CAR / wrapper bytes and return raw haven-cli `.encrypted` payload.
 */
export function extractHavenEncryptedPayload(downloaded: Uint8Array): Uint8Array {
  if (downloaded.length < BASE_IV_SIZE + CHUNK_HEADER_SIZE + GCM_TAG_MIN) {
    throw new EncryptedPayloadError(
      `Downloaded object is too small (${downloaded.length} bytes) to be a haven encrypted video.`
    )
  }

  const offset = findHavenChunkedEncryptOffset(downloaded)
  if (offset != null) {
    return offset === 0 ? downloaded : downloaded.subarray(offset)
  }

  const probe = new DataView(
    downloaded.buffer,
    downloaded.byteOffset + BASE_IV_SIZE,
    Math.min(CHUNK_HEADER_SIZE, downloaded.length - BASE_IV_SIZE)
  )
  const bogusIndex = downloaded.length > BASE_IV_SIZE + 4
    ? probe.getUint32(0, true)
    : 0
  const bogusLength = downloaded.length > BASE_IV_SIZE + 8
    ? probe.getUint32(4, true)
    : 0

  const looksLikeMp4 =
    downloaded.length > 8 &&
    downloaded[4] === 0x66 && // 'f'
    downloaded[5] === 0x74 && // 't'
    downloaded[6] === 0x79 && // 'y'
    downloaded[7] === 0x70 // 'p'

  if (looksLikeMp4) {
    throw new EncryptedPayloadError(
      'Downloaded bytes look like a plain MP4 (ftyp), not haven encrypted content. ' +
        'Check that the video is marked encrypted on Arkiv and was uploaded with encryption enabled.'
    )
  }

  throw new EncryptedPayloadError(
    'Could not find haven-cli encrypted chunk header in the Filecoin download. ' +
      `The piece may be a CAR wrapper we failed to unpack (bogus chunk index ${bogusIndex}, ` +
      `length ${bogusLength}). Re-upload with haven-cli or contact support.`
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
