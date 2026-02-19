/**
 * Cache Integrity Verification
 *
 * Validates cached video entries to ensure they are valid and playable.
 * Detects corrupted entries that need to be evicted and re-fetched.
 *
 * @module lib/cache-integrity
 * @see ./video-cache.ts - Uses these utilities before serving cached content
 * @see ./cache-errors.ts - Logs integrity check failures
 */

import { getVideo, type VideoCacheResult } from './video-cache'
import { logCacheError, type CacheErrorCode } from './cache-errors'

// ============================================================================
// Configuration
// ============================================================================

/**
 * Minimum valid video size in bytes.
 * Videos smaller than this are likely corrupted or truncated.
 */
const MIN_VIDEO_SIZE = 1024 // 1KB

/**
 * Maximum size variance allowed between metadata and actual blob.
 * Accounts for header overhead and small discrepancies.
 */
const SIZE_VARIANCE_THRESHOLD = 1024 // 1KB

// ============================================================================
// Verification Result Types
// ============================================================================

/**
 * Result of a cache integrity verification.
 */
export interface VerificationResult {
  /** Whether the entry is valid */
  valid: boolean

  /** Error code if invalid */
  errorCode?: CacheErrorCode

  /** Human-readable error message if invalid */
  message?: string

  /** Detailed context about the failure */
  details?: Record<string, unknown>
}

// ============================================================================
// Core Verification Function
// ============================================================================

/**
 * Verify a cached video entry is valid and playable.
 * Returns true if the entry appears valid, false if it should be evicted.
 *
 * Performs the following checks:
 * 1. Entry exists in cache
 * 2. Response status is 200 OK
 * 3. Content-Type is valid (video/* or application/*)
 * 4. Response body is readable
 * 5. Blob size is reasonable (>= 1KB)
 * 6. Size matches metadata within tolerance
 *
 * @param videoId - The video ID to verify
 * @returns Promise resolving to verification result
 *
 * @example
 * ```typescript
 * const result = await verifyCacheEntry('0x123...')
 * if (!result.valid) {
 *   console.warn('Cache entry invalid:', result.message)
 *   await deleteVideo('0x123...')
 * }
 * ```
 */
export async function verifyCacheEntry(videoId: string): Promise<VerificationResult> {
  try {
    // Get the cached entry
    const result = await getVideo(videoId)

    if (!result) {
      return {
        valid: false,
        errorCode: 'CACHE_READ_FAILED',
        message: 'Cache entry not found',
        details: { videoId },
      }
    }

    return await verifyVideoCacheResult(videoId, result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown verification error'

    logCacheError({
      code: 'INTEGRITY_CHECK_FAILED',
      message: `Verification failed for ${videoId}: ${message}`,
      videoId,
      originalError: error instanceof Error ? error : undefined,
    })

    return {
      valid: false,
      errorCode: 'INTEGRITY_CHECK_FAILED',
      message: `Verification error: ${message}`,
      details: { videoId, error },
    }
  }
}

/**
 * Verify a VideoCacheResult with detailed checks.
 * This is the internal implementation used by verifyCacheEntry.
 *
 * @param videoId - The video ID
 * @param result - The VideoCacheResult to verify
 * @returns Verification result
 */
async function verifyVideoCacheResult(
  videoId: string,
  result: VideoCacheResult
): Promise<VerificationResult> {
  const { response, metadata } = result

  // Check 1: Response status is 200
  if (response.status !== 200) {
    return {
      valid: false,
      errorCode: 'CACHE_READ_FAILED',
      message: `Invalid response status: ${response.status}`,
      details: { videoId, status: response.status, statusText: response.statusText },
    }
  }

  // Check 2: Content-Type is valid
  const contentType = response.headers.get('Content-Type') || ''
  if (!isValidContentType(contentType)) {
    return {
      valid: false,
      errorCode: 'CACHE_CORRUPTED',
      message: `Invalid Content-Type: ${contentType}`,
      details: { videoId, contentType },
    }
  }

  // Check 3: Response body is readable (get blob)
  let blob: Blob
  try {
    blob = await response.clone().blob()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return {
      valid: false,
      errorCode: 'CACHE_CORRUPTED',
      message: `Failed to read response body: ${message}`,
      details: { videoId, error },
    }
  }

  // Check 4: Blob size is reasonable
  if (blob.size < MIN_VIDEO_SIZE) {
    return {
      valid: false,
      errorCode: 'CACHE_CORRUPTED',
      message: `Video too small (${blob.size} bytes, min ${MIN_VIDEO_SIZE})`,
      details: { videoId, size: blob.size, minSize: MIN_VIDEO_SIZE },
    }
  }

  // Check 5: Size matches metadata within tolerance
  if (metadata.size > 0) {
    const sizeDiff = Math.abs(blob.size - metadata.size)
    if (sizeDiff > SIZE_VARIANCE_THRESHOLD) {
      return {
        valid: false,
        errorCode: 'CACHE_CORRUPTED',
        message: `Size mismatch: blob=${blob.size}, metadata=${metadata.size}`,
        details: {
          videoId,
          blobSize: blob.size,
          metadataSize: metadata.size,
          variance: sizeDiff,
          threshold: SIZE_VARIANCE_THRESHOLD,
        },
      }
    }
  }

  // All checks passed
  return { valid: true }
}

// ============================================================================
// Content Type Validation
// ============================================================================

/**
 * Valid video MIME type prefixes.
 */
const VIDEO_TYPE_PREFIXES = [
  'video/',
  'application/mp4',
  'application/mpeg',
  'application/ogg',
  'application/x-mpegURL', // HLS playlists
  'application/dash+xml', // DASH manifests
]

/**
 * Check if a Content-Type is valid for video content.
 *
 * @param contentType - The Content-Type header value
 * @returns true if valid for video
 */
function isValidContentType(contentType: string): boolean {
  if (!contentType) return false
  const normalized = contentType.toLowerCase().trim()
  return VIDEO_TYPE_PREFIXES.some((prefix) => normalized.startsWith(prefix))
}

// ============================================================================
// Batch Verification
// ============================================================================

/**
 * Result of batch verification for multiple videos.
 */
export interface BatchVerificationResult {
  /** Total number of videos checked */
  total: number

  /** Number of valid entries */
  valid: number

  /** Number of invalid entries */
  invalid: number

  /** IDs of invalid entries that should be evicted */
  invalidIds: string[]

  /** Detailed results for each video */
  results: Map<string, VerificationResult>
}

/**
 * Verify multiple cache entries in parallel.
 * Useful for periodic cache health checks.
 *
 * @param videoIds - Array of video IDs to verify
 * @returns Batch verification result
 *
 * @example
 * ```typescript
 * const result = await verifyMultipleEntries(['0x123...', '0x456...'])
 * console.log(`${result.invalid} corrupted entries found`)
 * for (const id of result.invalidIds) {
 *   await deleteVideo(id)
 * }
 * ```
 */
export async function verifyMultipleEntries(
  videoIds: string[]
): Promise<BatchVerificationResult> {
  const results = new Map<string, VerificationResult>()
  const invalidIds: string[] = []

  // Verify all entries in parallel
  const verificationPromises = videoIds.map(async (videoId) => {
    const result = await verifyCacheEntry(videoId)
    results.set(videoId, result)
    if (!result.valid) {
      invalidIds.push(videoId)
    }
  })

  await Promise.all(verificationPromises)

  return {
    total: videoIds.length,
    valid: videoIds.length - invalidIds.length,
    invalid: invalidIds.length,
    invalidIds,
    results,
  }
}

// ============================================================================
// Safe Cache Access
// ============================================================================

/**
 * Safely get a cached video with automatic corruption detection.
 * If the entry is corrupted, it will be deleted and null returned.
 *
 * @param videoId - The video ID to retrieve
 * @param options - Options for handling corrupted entries
 * @returns VideoCacheResult or null if not found or corrupted
 *
 * @example
 * ```typescript
 * const result = await safeGetVideo('0x123...')
 * if (result) {
 *   // Use the cached video
 * } else {
 *   // Fetch from network
 * }
 * ```
 */
export async function safeGetVideo(
  videoId: string,
  options: {
    /** Automatically delete corrupted entries (default: true) */
    autoDelete?: boolean
    /** Log verification failures (default: true) */
    logFailures?: boolean
  } = {}
): Promise<VideoCacheResult | null> {
  const { autoDelete = true, logFailures = true } = options

  // First try to get the entry
  const result = await getVideo(videoId)
  if (!result) {
    return null
  }

  // Verify the entry
  const verification = await verifyCacheEntry(videoId)

  if (!verification.valid) {
    if (logFailures) {
      console.warn('[VideoCache] Corrupted cache entry:', videoId, verification.message)
    }

    // Log the error
    logCacheError({
      code: verification.errorCode || 'CACHE_CORRUPTED',
      message: verification.message || 'Cache entry verification failed',
      videoId,
      context: verification.details,
    })

    // Auto-delete corrupted entry
    if (autoDelete) {
      const { deleteVideo } = await import('./video-cache')
      await deleteVideo(videoId)
      console.info('[VideoCache] Deleted corrupted entry:', videoId)
    }

    return null
  }

  return result
}

// ============================================================================
// Cache Health Metrics
// ============================================================================

/**
 * Cache health metrics for monitoring.
 */
export interface CacheHealthMetrics {
  /** Percentage of valid entries (0-100) */
  healthScore: number

  /** Total number of entries checked */
  totalEntries: number

  /** Number of valid entries */
  validEntries: number

  /** Number of corrupted entries */
  corruptedEntries: number

  /** Number of missing entries */
  missingEntries: number
}

/**
 * Calculate cache health metrics by sampling entries.
 *
 * @param videoIds - Array of video IDs to check
 * @returns Health metrics
 */
export async function getCacheHealthMetrics(
  videoIds: string[]
): Promise<CacheHealthMetrics> {
  const result = await verifyMultipleEntries(videoIds)

  const healthScore = result.total > 0 ? (result.valid / result.total) * 100 : 100

  return {
    healthScore: Math.round(healthScore * 10) / 10, // Round to 1 decimal
    totalEntries: result.total,
    validEntries: result.valid,
    corruptedEntries: result.invalid,
    missingEntries: 0, // We check existence before calling this
  }
}
