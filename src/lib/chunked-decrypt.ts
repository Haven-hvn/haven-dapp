/**
 * Chunked File Decryption
 *
 * Decrypts files encrypted by haven-cli's `encrypt_file_streaming()` function.
 * The chunked format allows streaming decryption of large files without loading
 * the entire plaintext into memory at once.
 *
 * ## File Format
 *
 * ```
 * [12-byte base_iv]
 * [4-byte chunk_index_0 LE][4-byte chunk_length_0 LE][encrypted_chunk_0]
 * [4-byte chunk_index_1 LE][4-byte chunk_length_1 LE][encrypted_chunk_1]
 * ...
 * ```
 *
 * Each chunk is independently AES-256-GCM encrypted with a per-chunk IV derived
 * from the base IV and chunk index. Default chunk size is 1MB plaintext
 * (encrypted chunks are 16 bytes larger due to GCM auth tag).
 *
 * ## Per-Chunk IV Derivation
 *
 * The per-chunk IV is derived by XORing the big-endian u64 representation of
 * the chunk index into bytes [4..12] of the base IV. This matches the Python
 * implementation in `haven_cli/crypto/haven_aol_local.py::_derive_chunk_iv()`.
 *
 * @module lib/chunked-decrypt
 * @see haven-cli-main/haven_cli/crypto/haven_aol_local.py
 */

import { putVideo, VIDEO_URL_PREFIX } from './video-cache'

// ============================================================================
// Constants
// ============================================================================

/** Size of the base IV at the start of the file */
const BASE_IV_SIZE = 12

/** Size of the chunk index field (uint32 LE) */
const CHUNK_INDEX_SIZE = 4

/** Size of the chunk length field (uint32 LE) */
const CHUNK_LENGTH_SIZE = 4

/** Total header size per chunk (index + length) */
const CHUNK_HEADER_SIZE = CHUNK_INDEX_SIZE + CHUNK_LENGTH_SIZE

/** Maximum allowed chunk size (64 MiB) — matches Python's sanity check */
const MAX_CHUNK_SIZE = 64 * 1024 * 1024

/** AES-GCM auth tag overhead per chunk (16 bytes) */
const GCM_TAG_SIZE = 16

/** Default plaintext chunk size used by haven-cli (1 MiB) */
const DEFAULT_CHUNK_SIZE = 1024 * 1024

// ============================================================================
// Types
// ============================================================================

/**
 * Progress callback for chunked decryption.
 *
 * @param chunkIndex - 0-based index of the chunk just decrypted
 * @param totalChunksEstimate - Estimated total number of chunks
 * @param bytesDecrypted - Cumulative plaintext bytes decrypted so far
 * @param totalBytesEstimate - Estimated total plaintext bytes
 */
export type ChunkedDecryptProgress = (
  chunkIndex: number,
  totalChunksEstimate: number,
  bytesDecrypted: number,
  totalBytesEstimate: number
) => void

/**
 * Options for chunked decryption operations.
 */
export interface ChunkedDecryptOptions {
  /** AbortSignal for cancellation */
  signal?: AbortSignal
  /** Progress callback invoked after each chunk */
  onProgress?: ChunkedDecryptProgress
  /** Callback invoked with each decrypted chunk (for progressive playback) */
  onChunk?: (chunk: Uint8Array, chunkIndex: number, isLast: boolean) => void | Promise<void>
}

/**
 * Result of parsing the chunked file header.
 */
export interface ChunkedFileHeader {
  /** The 12-byte base IV */
  baseIv: Uint8Array
  /** Offset where chunk data starts (always 12) */
  dataOffset: number
  /** Estimated number of chunks based on file size */
  estimatedChunks: number
  /** Estimated total plaintext size */
  estimatedPlaintextSize: number
}

/**
 * A single parsed chunk record.
 */
interface ChunkRecord {
  /** 0-based chunk index */
  index: number
  /** Encrypted chunk data (ciphertext + auth tag) */
  encryptedData: Uint8Array
  /** Offset of the next chunk in the file */
  nextOffset: number
}

// ============================================================================
// IV Derivation
// ============================================================================

/**
 * Derive the per-chunk IV from the base IV and chunk index.
 *
 * XORs the big-endian u64 representation of the chunk index into
 * bytes [4..12] of the base IV. This produces a unique IV for each
 * chunk while maintaining the GCM nonce-misuse resistance property
 * (each IV is used exactly once with the same key).
 *
 * Matches: `haven_cli/crypto/haven_aol_local.py::_derive_chunk_iv()`
 *
 * @param baseIv - The 12-byte base IV from the file header
 * @param chunkIndex - The 0-based chunk index
 * @returns The derived 12-byte per-chunk IV
 * @throws Error if baseIv is not 12 bytes
 */
export function deriveChunkIv(baseIv: Uint8Array, chunkIndex: number): Uint8Array {
  if (baseIv.length !== BASE_IV_SIZE) {
    throw new Error(`Base IV must be ${BASE_IV_SIZE} bytes, got ${baseIv.length}`)
  }

  // Create a mutable copy of the base IV
  const perIv = new Uint8Array(baseIv)

  // Convert chunk index to big-endian u64 (8 bytes)
  // JavaScript numbers are safe up to 2^53-1, which is more than enough
  // for chunk indices (a 1MB-chunk file would need 2^53 chunks = 9 PB)
  const idxBytes = new Uint8Array(8)
  const view = new DataView(idxBytes.buffer)
  // DataView.setBigUint64 handles the full 64-bit range
  view.setBigUint64(0, BigInt(chunkIndex), false) // big-endian

  // XOR idx_bytes into perIv[4..12]
  for (let i = 0; i < 8; i++) {
    perIv[i + 4] ^= idxBytes[i]
  }

  return perIv
}

// ============================================================================
// File Parsing
// ============================================================================

/**
 * Parse and validate the chunked file header.
 *
 * Extracts the base IV and computes estimates for total chunks and
 * plaintext size based on the encrypted file size.
 *
 * @param encryptedData - The full encrypted file data
 * @returns Parsed header information
 * @throws Error if data is too short to contain a valid header
 */
export function parseChunkedFileHeader(encryptedData: Uint8Array): ChunkedFileHeader {
  if (encryptedData.length < BASE_IV_SIZE + CHUNK_HEADER_SIZE) {
    throw new Error(
      `Encrypted data too short (${encryptedData.length} bytes). ` +
      `Minimum size is ${BASE_IV_SIZE + CHUNK_HEADER_SIZE} bytes for a single-chunk file.`
    )
  }

  const baseIv = encryptedData.slice(0, BASE_IV_SIZE)
  const dataSize = encryptedData.length - BASE_IV_SIZE

  // Estimate chunks: each chunk is CHUNK_HEADER_SIZE + (plaintext_size + GCM_TAG_SIZE)
  // Default plaintext chunk = 1MB, so encrypted chunk ≈ 1MB + 16 + 8 header = ~1,048,600 bytes
  const avgEncryptedChunkSize = DEFAULT_CHUNK_SIZE + GCM_TAG_SIZE + CHUNK_HEADER_SIZE
  const estimatedChunks = Math.max(1, Math.ceil(dataSize / avgEncryptedChunkSize))
  const estimatedPlaintextSize = Math.max(0, dataSize - estimatedChunks * (CHUNK_HEADER_SIZE + GCM_TAG_SIZE))

  return {
    baseIv,
    dataOffset: BASE_IV_SIZE,
    estimatedChunks,
    estimatedPlaintextSize,
  }
}

/**
 * Read a single chunk record from the encrypted data at the given offset.
 *
 * @param data - Full encrypted file data
 * @param offset - Current read position
 * @returns Parsed chunk record, or null if at end of file
 * @throws Error on malformed data
 */
function readChunkRecord(data: Uint8Array, offset: number): ChunkRecord | null {
  // Check for EOF
  if (offset >= data.length) {
    return null
  }

  // Need at least CHUNK_HEADER_SIZE bytes for index + length
  if (offset + CHUNK_HEADER_SIZE > data.length) {
    throw new Error(
      `Truncated chunk header at offset ${offset}: ` +
      `need ${CHUNK_HEADER_SIZE} bytes, have ${data.length - offset}`
    )
  }

  // Read chunk index (uint32 LE)
  const view = new DataView(data.buffer, data.byteOffset + offset, CHUNK_HEADER_SIZE)
  const chunkIndex = view.getUint32(0, true) // little-endian
  const chunkLength = view.getUint32(4, true) // little-endian

  // Sanity check: prevent OOM on malformed files
  if (chunkLength > MAX_CHUNK_SIZE) {
    throw new Error(
      `Chunk ${chunkIndex} claims ${chunkLength} bytes — ` +
      `exceeds maximum allowed chunk size (${MAX_CHUNK_SIZE} bytes). ` +
      'The download may be a CAR container or non-chunked ciphertext; haven-cli streaming encrypt was expected.'
    )
  }

  // Validate we have enough data for the chunk
  const chunkDataOffset = offset + CHUNK_HEADER_SIZE
  if (chunkDataOffset + chunkLength > data.length) {
    throw new Error(
      `Truncated chunk data at chunk ${chunkIndex}: ` +
      `expected ${chunkLength} bytes, have ${data.length - chunkDataOffset}`
    )
  }

  return {
    index: chunkIndex,
    encryptedData: data.subarray(chunkDataOffset, chunkDataOffset + chunkLength),
    nextOffset: chunkDataOffset + chunkLength,
  }
}

// ============================================================================
// Decryption Functions
// ============================================================================

/**
 * Decrypt a single chunk using AES-256-GCM with the derived per-chunk IV.
 *
 * @param encryptedChunk - The encrypted chunk data (ciphertext + auth tag)
 * @param cryptoKey - The imported CryptoKey for AES-GCM
 * @param baseIv - The 12-byte base IV
 * @param chunkIndex - The chunk index for IV derivation
 * @returns Decrypted plaintext chunk
 * @throws Error on decryption failure (wrong key or corrupted data)
 */
async function decryptSingleChunk(
  encryptedChunk: Uint8Array,
  cryptoKey: CryptoKey,
  baseIv: Uint8Array,
  chunkIndex: number
): Promise<Uint8Array> {
  const perIv = deriveChunkIv(baseIv, chunkIndex)

  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: perIv as BufferSource },
      cryptoKey,
      encryptedChunk as BufferSource
    )
    return new Uint8Array(decrypted)
  } catch (error) {
    if (error instanceof DOMException) {
      throw new Error(
        `AES-GCM decryption failed on chunk ${chunkIndex}: ${error.message || error.name}. ` +
        'The downloaded bytes may not be the haven-cli encrypted file (check CAR extraction), ' +
        'or the Haven-AOL key does not match this upload.'
      )
    }
    throw error
  }
}

/**
 * Decrypt a chunked encrypted file, yielding plaintext chunks via async generator.
 *
 * This is the lowest-level decryption API. It parses the chunked format,
 * validates chunk ordering, derives per-chunk IVs, and decrypts each chunk
 * independently using AES-256-GCM.
 *
 * Use this when you need per-chunk control (e.g., for progressive playback
 * via MediaSource API).
 *
 * @param encryptedData - The full encrypted file data in haven-cli chunked format
 * @param aesKey - The 256-bit AES key (from Haven-AOL VetKD decryption)
 * @param options - Decryption options (signal, progress, onChunk callbacks)
 * @yields Decrypted plaintext chunks in order
 * @throws Error on format violation, decryption failure, or cancellation
 *
 * @example
 * ```typescript
 * const chunks: Uint8Array[] = []
 * for await (const chunk of decryptChunkedStream(encrypted, key)) {
 *   chunks.push(chunk)
 * }
 * const plaintext = concatenateChunks(chunks)
 * ```
 */
export async function* decryptChunkedStream(
  encryptedData: Uint8Array,
  aesKey: Uint8Array,
  options: ChunkedDecryptOptions = {}
): AsyncGenerator<Uint8Array, void, unknown> {
  const { signal, onProgress, onChunk } = options

  // Parse header
  const header = parseChunkedFileHeader(encryptedData)

  // Import AES key for Web Crypto API
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    aesKey as BufferSource,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  )

  let offset = header.dataOffset
  let expectedChunkIndex = 0
  let totalBytesDecrypted = 0

  while (offset < encryptedData.length) {
    // Check cancellation
    if (signal?.aborted) {
      throw new Error('Decryption cancelled')
    }

    // Read chunk record
    const record = readChunkRecord(encryptedData, offset)
    if (!record) break

    // Verify sequential ordering (prevents reordering/duplication attacks)
    if (record.index !== expectedChunkIndex) {
      throw new Error(
        `Chunk ordering violation: expected chunk ${expectedChunkIndex}, ` +
        `got ${record.index}. File may have been tampered with.`
      )
    }

    // Decrypt chunk
    const plaintext = await decryptSingleChunk(
      record.encryptedData,
      cryptoKey,
      header.baseIv,
      record.index
    )

    totalBytesDecrypted += plaintext.byteLength
    offset = record.nextOffset
    const isLast = offset >= encryptedData.length

    // Invoke onChunk callback (for progressive playback)
    if (onChunk) {
      await onChunk(plaintext, record.index, isLast)
    }

    // Report progress
    onProgress?.(
      record.index,
      header.estimatedChunks,
      totalBytesDecrypted,
      header.estimatedPlaintextSize
    )

    expectedChunkIndex++

    yield plaintext
  }

  if (expectedChunkIndex === 0) {
    throw new Error('No chunks found in encrypted file')
  }
}

/**
 * Decrypt a complete chunked file and return the full plaintext.
 *
 * Collects all decrypted chunks and concatenates them into a single buffer.
 * For large files, consider using `decryptChunkedStream` with progressive
 * processing instead.
 *
 * @param encryptedData - The full encrypted file data
 * @param aesKey - The 256-bit AES key
 * @param options - Decryption options
 * @returns The complete decrypted plaintext
 * @throws Error on any failure
 *
 * @example
 * ```typescript
 * const plaintext = await decryptChunkedFile(encrypted, key, {
 *   onProgress: (chunk, total) => console.log(`${chunk + 1}/${total}`)
 * })
 * ```
 */
export async function decryptChunkedFile(
  encryptedData: Uint8Array,
  aesKey: Uint8Array,
  options: ChunkedDecryptOptions = {}
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  let totalSize = 0

  for await (const chunk of decryptChunkedStream(encryptedData, aesKey, options)) {
    chunks.push(chunk)
    totalSize += chunk.byteLength
  }

  // Concatenate all chunks into a single buffer
  return concatenateChunks(chunks, totalSize)
}

/**
 * Decrypt a chunked file and write directly to the Cache API.
 *
 * This is the recommended function for the decryption pipeline. It:
 * 1. Decrypts all chunks
 * 2. Concatenates the plaintext
 * 3. Writes to Cache API via putVideo()
 * 4. Returns the synthetic URL for playback
 *
 * Avoids creating intermediate blob URLs, saving one full copy of the
 * video from JS heap memory.
 *
 * @param encryptedData - The full encrypted file data
 * @param aesKey - The 256-bit AES key
 * @param videoId - Unique identifier for the video (cache key)
 * @param mimeType - MIME type of the video (default: 'video/mp4')
 * @param options - Decryption options
 * @returns The synthetic URL for the cached video (/haven/v/{videoId})
 * @throws Error on any failure
 *
 * @example
 * ```typescript
 * const url = await decryptChunkedToCache(
 *   encryptedData, aesKey, video.id, 'video/mp4',
 *   { onProgress: updateProgressBar }
 * )
 * // url === '/haven/v/{videoId}' — served by service worker
 * ```
 */
export async function decryptChunkedToCache(
  encryptedData: Uint8Array,
  aesKey: Uint8Array,
  videoId: string,
  mimeType: string = 'video/mp4',
  options: ChunkedDecryptOptions = {}
): Promise<string> {
  // Decrypt full file
  const plaintext = await decryptChunkedFile(encryptedData, aesKey, options)

  // Write directly to Cache API
  await putVideo(videoId, plaintext, mimeType)

  // Return synthetic URL served by service worker
  return `${VIDEO_URL_PREFIX}${videoId}`
}

/**
 * Decrypt a chunked file with progressive playback support.
 *
 * This function orchestrates the "decrypt and play simultaneously" flow:
 * 1. Starts decrypting chunks
 * 2. Feeds each decrypted chunk to an `onChunk` callback (for MediaSource)
 * 3. After all chunks are decrypted, caches the full content
 * 4. Returns the cache URL for future instant playback
 *
 * The `onChunk` callback receives each plaintext chunk as it's decrypted,
 * allowing progressive feeding to MediaSource SourceBuffer for sub-second
 * time-to-first-frame.
 *
 * @param encryptedData - The full encrypted file data
 * @param aesKey - The 256-bit AES key
 * @param videoId - Unique identifier for the video
 * @param mimeType - MIME type of the video
 * @param options - Must include `onChunk` callback for progressive feeding
 * @returns The cache URL after completion
 */
export async function decryptChunkedProgressive(
  encryptedData: Uint8Array,
  aesKey: Uint8Array,
  videoId: string,
  mimeType: string = 'video/mp4',
  options: ChunkedDecryptOptions & { onChunk: NonNullable<ChunkedDecryptOptions['onChunk']> }
): Promise<string> {
  const chunks: Uint8Array[] = []
  let totalSize = 0

  // Decrypt with per-chunk callback for progressive playback
  for await (const chunk of decryptChunkedStream(encryptedData, aesKey, options)) {
    chunks.push(chunk)
    totalSize += chunk.byteLength
  }

  // Cache the full decrypted content for instant replay
  const plaintext = concatenateChunks(chunks, totalSize)
  await putVideo(videoId, plaintext, mimeType)

  return `${VIDEO_URL_PREFIX}${videoId}`
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Concatenate multiple Uint8Array chunks into a single buffer.
 *
 * @param chunks - Array of chunks to concatenate
 * @param totalSize - Pre-computed total size (optimization to avoid re-calculation)
 * @returns Single Uint8Array containing all chunks
 */
export function concatenateChunks(chunks: Uint8Array[], totalSize?: number): Uint8Array {
  const size = totalSize ?? chunks.reduce((acc, c) => acc + c.byteLength, 0)
  const result = new Uint8Array(size)
  let offset = 0

  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }

  return result
}

/**
 * Detect whether the given encrypted data is in chunked format.
 *
 * Performs a heuristic check by validating:
 * 1. Data is at least 20 bytes (12 IV + 4 index + 4 length)
 * 2. First chunk index is 0
 * 3. First chunk length is reasonable (≤ MAX_CHUNK_SIZE)
 * 4. First chunk length + header doesn't exceed total data
 *
 * This allows the decryption pipeline to automatically choose between
 * chunked decryption and single-pass decryption for backward compatibility.
 *
 * @param data - The encrypted data to check
 * @returns true if the data appears to be in chunked format
 */
export function isChunkedFormat(data: Uint8Array): boolean {
  if (data.length < BASE_IV_SIZE + CHUNK_HEADER_SIZE + GCM_TAG_SIZE) {
    return false
  }

  try {
    const view = new DataView(
      data.buffer,
      data.byteOffset + BASE_IV_SIZE,
      CHUNK_HEADER_SIZE
    )

    const firstChunkIndex = view.getUint32(0, true)
    const firstChunkLength = view.getUint32(4, true)

    // First chunk should have index 0
    if (firstChunkIndex !== 0) {
      return false
    }

    // Chunk length should be reasonable
    if (firstChunkLength === 0 || firstChunkLength > MAX_CHUNK_SIZE) {
      return false
    }

    // Chunk data should fit within the file
    if (BASE_IV_SIZE + CHUNK_HEADER_SIZE + firstChunkLength > data.length) {
      return false
    }

    // Additional check: the chunk length should be consistent with
    // AES-GCM encrypted 1MB chunk (1MB + 16 bytes tag = 1,048,592)
    // Allow any size up to 64MB (the max), but flag suspiciously small
    // values that might indicate this isn't actually chunked format
    if (firstChunkLength < GCM_TAG_SIZE + 1) {
      return false // Can't be valid — need at least 1 byte plaintext + 16 byte tag
    }

    return true
  } catch {
    return false
  }
}

/**
 * Estimate the number of chunks and total plaintext size.
 *
 * Useful for progress estimation before starting decryption.
 *
 * @param encryptedSize - Total encrypted file size in bytes
 * @returns Object with estimated chunks and plaintext size
 */
export function estimateChunks(encryptedSize: number): {
  chunks: number
  plaintextSize: number
} {
  const dataSize = encryptedSize - BASE_IV_SIZE
  const avgChunkWithHeader = DEFAULT_CHUNK_SIZE + GCM_TAG_SIZE + CHUNK_HEADER_SIZE
  const chunks = Math.max(1, Math.ceil(dataSize / avgChunkWithHeader))
  const plaintextSize = Math.max(0, dataSize - chunks * (CHUNK_HEADER_SIZE + GCM_TAG_SIZE))

  return { chunks, plaintextSize }
}
