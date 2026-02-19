/**
 * Origin Private File System (OPFS) Staging Utilities
 *
 * Provides utilities for staging large encrypted video files on disk using the
 * Origin Private File System (OPFS) API. This dramatically reduces memory pressure
 * during the fetch → decrypt pipeline by streaming encrypted data to disk instead
 * of holding it entirely in the JS heap.
 *
 * ## Memory Problem Solved
 *
 * The traditional flow holds **three copies** of the video in JS heap:
 * 1. `encryptedData: Uint8Array` — fetched via Synapse SDK (~500MB)
 * 2. `decryptedData: Uint8Array` — output of `aesDecrypt()` (~500MB)
 * 3. `blob: Blob` — created for `URL.createObjectURL()` (~500MB)
 *
 * For a 500MB video, this means **~1.5GB of JS heap usage**. Mobile devices
 * with 2-4GB total RAM will crash.
 *
 * ## OPFS Solution
 *
 * By streaming the encrypted data directly to OPFS:
 * 1. Stream Synapse fetch directly to OPFS file (encrypted bytes never enter JS heap in bulk)
 * 2. Read from OPFS for decryption
 * 3. Write decrypted output directly to Cache API
 * 4. Delete the OPFS staging file
 *
 * This reduces peak JS heap usage from ~1.5GB to ~500MB (only the decrypted data in transit).
 *
 * @module lib/opfs
 * @see https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system
 */

// ============================================================================
// Constants
// ============================================================================

/**
 * Directory name for staging encrypted video files in OPFS.
 * All staging files are stored under this directory.
 */
const STAGING_DIR = 'haven-staging'

/**
 * File extension for staged encrypted video files.
 */
const STAGING_EXTENSION = '.enc'

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error thrown when OPFS operations fail.
 */
export class OpfsError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly videoId?: string
  ) {
    super(message)
    this.name = 'OpfsError'
  }
}

// ============================================================================
// Feature Detection
// ============================================================================

/**
 * Check if the Origin Private File System (OPFS) is available.
 *
 * OPFS requires `navigator.storage.getDirectory` which is available in:
 * - Chrome 86+
 * - Edge 86+
 * - Firefox 111+ (partial support)
 * - Safari 15.2+ (limited support)
 *
 * @returns True if OPFS is available in the current environment
 *
 * @example
 * ```typescript
 * if (isOpfsAvailable()) {
 *   // Use OPFS staging for large files
 *   await writeToStaging(videoId, stream)
 * } else {
 *   // Fall back to in-memory buffering
 * }
 * ```
 */
export function isOpfsAvailable(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'storage' in navigator &&
    'getDirectory' in navigator.storage
  )
}

/**
 * Assert that OPFS is available before attempting operations.
 * Throws a clear error if OPFS is not supported.
 *
 * @throws OpfsError if OPFS is not available
 */
function assertOpfsAvailable(): void {
  if (!isOpfsAvailable()) {
    throw new OpfsError(
      'Origin Private File System (OPFS) is not available in this browser. ' +
        'Please use Chrome 86+, Edge 86+, or Firefox 111+.',
      'OPFS_NOT_AVAILABLE'
    )
  }
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Get or create the staging directory handle.
 *
 * @returns FileSystemDirectoryHandle for the staging directory
 * @throws OpfsError if OPFS is not available or directory cannot be created
 */
async function getStagingDir(): Promise<FileSystemDirectoryHandle> {
  assertOpfsAvailable()

  try {
    const root = await navigator.storage.getDirectory()
    return await root.getDirectoryHandle(STAGING_DIR, { create: true })
  } catch (error) {
    throw new OpfsError(
      `Failed to access OPFS staging directory: ${error instanceof Error ? error.message : 'unknown error'}`,
      'STAGING_DIR_ERROR'
    )
  }
}

/**
 * Build the filename for a video's staging file.
 *
 * @param videoId - The video ID
 * @returns The filename (e.g., "video123.enc")
 */
function getStagingFilename(videoId: string): string {
  // Sanitize videoId to ensure it's a valid filename
  const sanitized = videoId.replace(/[^a-zA-Z0-9_-]/g, '_')
  return `${sanitized}${STAGING_EXTENSION}`
}

// ============================================================================
// Core API Functions
// ============================================================================

/**
 * Write a stream of encrypted data to an OPFS staging file.
 *
 * Streams data directly to disk without buffering in JS heap. Supports
 * progress callbacks for UI updates during the fetch operation.
 *
 * @param videoId - Unique identifier for the video
 * @param stream - ReadableStream of encrypted data (from Synapse SDK)
 * @param onProgress - Optional callback for progress updates (bytes written)
 * @returns Promise resolving to total bytes written
 * @throws OpfsError if writing fails or OPFS is not available
 *
 * @example
 * ```typescript
 * // Stream from Synapse SDK to OPFS staging
 * const synapseStream = await streamFromIpfs(cid)
 * const bytesWritten = await writeToStaging(video.id, synapseStream, (bytes) => {
 *   setProgress((bytes / estimatedSize) * 100)
 * })
 * console.log(`Staged ${bytesWritten} bytes to OPFS`)
 * ```
 */
export async function writeToStaging(
  videoId: string,
  stream: ReadableStream<Uint8Array>,
  onProgress?: (bytesWritten: number) => void
): Promise<number> {
  assertOpfsAvailable()

  const dir = await getStagingDir()
  const filename = getStagingFilename(videoId)

  let fileHandle: FileSystemFileHandle
  try {
    fileHandle = await dir.getFileHandle(filename, { create: true })
  } catch (error) {
    throw new OpfsError(
      `Failed to create staging file for ${videoId}: ${error instanceof Error ? error.message : 'unknown error'}`,
      'FILE_CREATE_ERROR',
      videoId
    )
  }

  let writable: FileSystemWritableFileStream
  try {
    writable = await fileHandle.createWritable()
  } catch (error) {
    throw new OpfsError(
      `Failed to open writable stream for ${videoId}: ${error instanceof Error ? error.message : 'unknown error'}`,
      'WRITABLE_ERROR',
      videoId
    )
  }

  const reader = stream.getReader()
  let totalWritten = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      // Write the Uint8Array directly
      // Cast to any to work around TypeScript's strict ArrayBufferLike type
      await writable.write(value as unknown as ArrayBuffer)
      totalWritten += value.byteLength
      onProgress?.(totalWritten)
    }
  } catch (error) {
    throw new OpfsError(
      `Failed to write to staging file for ${videoId}: ${error instanceof Error ? error.message : 'unknown error'}`,
      'WRITE_ERROR',
      videoId
    )
  } finally {
    // Always close the writable stream
    try {
      await writable.close()
    } catch {
      // Ignore close errors
    }
    reader.releaseLock()
  }

  return totalWritten
}

/**
 * Read staged encrypted data back from OPFS.
 *
 * Currently returns the entire file as a Uint8Array. In the future, this
 * could return a ReadableStream for true streaming decryption.
 *
 * @param videoId - The video ID to read
 * @returns Promise resolving to the encrypted data as Uint8Array
 * @throws OpfsError if the file doesn't exist or cannot be read
 *
 * @example
 * ```typescript
 * // Read back for decryption
 * const encryptedData = await readFromStaging(video.id)
 *
 * // Decrypt (still in memory for now — AES-GCM requires full ciphertext)
 * const decryptedData = await aesDecrypt(encryptedData, aesKey, iv)
 *
 * // Store in Cache API
 * await putVideo(video.id, decryptedData, mimeType)
 *
 * // Clean up staging
 * await deleteStaging(video.id)
 * ```
 */
export async function readFromStaging(videoId: string): Promise<Uint8Array> {
  assertOpfsAvailable()

  const dir = await getStagingDir()
  const filename = getStagingFilename(videoId)

  let fileHandle: FileSystemFileHandle
  try {
    fileHandle = await dir.getFileHandle(filename)
  } catch (error) {
    throw new OpfsError(
      `Staging file not found for ${videoId}: ${error instanceof Error ? error.message : 'unknown error'}`,
      'FILE_NOT_FOUND',
      videoId
    )
  }

  let file: File
  try {
    file = await fileHandle.getFile()
  } catch (error) {
    throw new OpfsError(
      `Failed to access staging file for ${videoId}: ${error instanceof Error ? error.message : 'unknown error'}`,
      'FILE_ACCESS_ERROR',
      videoId
    )
  }

  try {
    const buffer = await file.arrayBuffer()
    return new Uint8Array(buffer)
  } catch (error) {
    throw new OpfsError(
      `Failed to read staging file for ${videoId}: ${error instanceof Error ? error.message : 'unknown error'}`,
      'READ_ERROR',
      videoId
    )
  }
}

/**
 * Delete a staging file after successful decryption.
 *
 * Silently ignores if the file doesn't exist (idempotent).
 *
 * @param videoId - The video ID to delete
 * @returns Promise that resolves when deletion is complete
 *
 * @example
 * ```typescript
 * try {
 *   const decryptedData = await aesDecrypt(encryptedData, aesKey, iv)
 *   await putVideo(video.id, decryptedData, mimeType)
 * } finally {
 *   // Always clean up staging, even if decryption fails
 *   await deleteStaging(video.id)
 * }
 * ```
 */
export async function deleteStaging(videoId: string): Promise<void> {
  if (!isOpfsAvailable()) {
    return
  }

  try {
    const dir = await getStagingDir()
    const filename = getStagingFilename(videoId)
    await dir.removeEntry(filename)
  } catch {
    // File doesn't exist or other error — silently ignore
  }
}

/**
 * Check if a staging file exists for a video.
 *
 * @param videoId - The video ID to check
 * @returns Promise resolving to true if the staging file exists
 *
 * @example
 * ```typescript
 * if (await hasStagingFile(video.id)) {
 *   console.log('Resuming from staged data...')
 *   const encryptedData = await readFromStaging(video.id)
 * }
 * ```
 */
export async function hasStagingFile(videoId: string): Promise<boolean> {
  if (!isOpfsAvailable()) {
    return false
  }

  try {
    const dir = await getStagingDir()
    const filename = getStagingFilename(videoId)
    await dir.getFileHandle(filename)
    return true
  } catch {
    return false
  }
}

/**
 * Get the size of a staging file in bytes.
 *
 * @param videoId - The video ID to check
 * @returns Promise resolving to size in bytes, or 0 if file doesn't exist
 *
 * @example
 * ```typescript
 * const size = await getStagingSize(video.id)
 * console.log(`Staged file size: ${formatBytes(size)}`)
 * ```
 */
export async function getStagingSize(videoId: string): Promise<number> {
  if (!isOpfsAvailable()) {
    return 0
  }

  try {
    const dir = await getStagingDir()
    const filename = getStagingFilename(videoId)
    const fileHandle = await dir.getFileHandle(filename)
    const file = await fileHandle.getFile()
    return file.size
  } catch {
    return 0
  }
}

/**
 * Clear all staging files by removing the entire staging directory.
 *
 * This deletes all encrypted video data staged in OPFS. Use with caution,
 * typically called during app cleanup or when cache is cleared.
 *
 * @returns Promise that resolves when all staging files are cleared
 *
 * @example
 * ```typescript
 * // Clear all staging on logout
 * await clearAllStaging()
 *
 * // Or when clearing all caches
 * await Promise.all([
 *   clearAllVideos(),      // Clear Cache API
 *   clearAllStaging(),      // Clear OPFS staging
 *   clearCachedVideos(),    // Clear IndexedDB
 * ])
 * ```
 */
export async function clearAllStaging(): Promise<void> {
  if (!isOpfsAvailable()) {
    return
  }

  try {
    const root = await navigator.storage.getDirectory()
    await root.removeEntry(STAGING_DIR, { recursive: true })
  } catch {
    // Directory doesn't exist or other error — silently ignore
  }
}

/**
 * List all video IDs that have staging files.
 *
 * Useful for debugging and cleanup operations.
 *
 * @returns Promise resolving to array of video IDs with staging files
 *
 * @example
 * ```typescript
 * const stagedVideos = await listStagedVideos()
 * console.log(`${stagedVideos.length} videos staged in OPFS`)
 * ```
 */
export async function listStagedVideos(): Promise<string[]> {
  if (!isOpfsAvailable()) {
    return []
  }

  try {
    const dir = await getStagingDir()
    const videos: string[] = []

    // @ts-expect-error - TypeScript doesn't know about values() yet
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind === 'file' && name.endsWith(STAGING_EXTENSION)) {
        // Extract videoId from filename (remove extension)
        const videoId = name.slice(0, -STAGING_EXTENSION.length)
        videos.push(videoId)
      }
    }

    return videos
  } catch {
    return []
  }
}

/**
 * Get the total size of all staging files.
 *
 * @returns Promise resolving to total size in bytes
 *
 * @example
 * ```typescript
 * const totalSize = await getTotalStagingSize()
 * console.log(`Total staging: ${formatBytes(totalSize)}`)
 * ```
 */
export async function getTotalStagingSize(): Promise<number> {
  if (!isOpfsAvailable()) {
    return 0
  }

  try {
    const dir = await getStagingDir()
    let totalSize = 0

    // @ts-expect-error - TypeScript doesn't know about values() yet
    for await (const [, handle] of dir.entries()) {
      if (handle.kind === 'file') {
        const fileHandle = handle as FileSystemFileHandle
        const file = await fileHandle.getFile()
        totalSize += file.size
      }
    }

    return totalSize
  } catch {
    return 0
  }
}

/**
 * Get a user-friendly error message for an OPFS error.
 *
 * @param error - The error to get a message for
 * @returns User-friendly error message
 *
 * @example
 * ```typescript
 * try {
 *   await writeToStaging(videoId, stream)
 * } catch (error) {
 *   showToast(getOpfsErrorMessage(error))
 * }
 * ```
 */
export function getOpfsErrorMessage(error: unknown): string {
  if (error instanceof OpfsError) {
    switch (error.code) {
      case 'OPFS_NOT_AVAILABLE':
        return 'Your browser does not support file staging. Please use Chrome, Edge, or Firefox.'
      case 'STAGING_DIR_ERROR':
        return 'Failed to access staging directory. Please check browser storage permissions.'
      case 'FILE_CREATE_ERROR':
        return 'Failed to create staging file. Storage may be full.'
      case 'WRITABLE_ERROR':
        return 'Failed to open file for writing. Please try again.'
      case 'WRITE_ERROR':
        return 'Failed to write data. The connection may have been interrupted.'
      case 'FILE_NOT_FOUND':
        return 'Staging file not found. The download may have been interrupted.'
      case 'FILE_ACCESS_ERROR':
        return 'Failed to access staging file. Please try again.'
      case 'READ_ERROR':
        return 'Failed to read staging file. The file may be corrupted.'
      default:
        return error.message || 'An unexpected staging error occurred.'
    }
  }

  if (error instanceof Error) {
    if (error.name === 'AbortError' || error.message.includes('aborted')) {
      return 'Staging operation was cancelled.'
    }
    return error.message
  }

  return 'An unexpected error occurred during staging.'
}
