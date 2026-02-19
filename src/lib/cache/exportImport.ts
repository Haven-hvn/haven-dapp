/**
 * Cache Export & Import
 *
 * Allows users to export their cached video metadata as a JSON file and import it back.
 * Provides a safety net beyond the browser's IndexedDB — users can back up their
 * library metadata to a file and restore it on a different browser, device, or
 * after clearing browser data.
 *
 * Security considerations:
 * - No encryption keys in export (litEncryptionMetadata contains encrypted keys, not plaintext)
 * - Wallet address verification (import only works for matching wallet address)
 * - Checksum verification (detects file corruption or tampering)
 * - No executable code (export is pure JSON data)
 */

import type { CachedVideo, CacheMetadataEntry } from '../../types/cache'
import { getAllCachedVideos, getAllCacheMetadata, putCachedVideos } from './db'
import { isValidCachedVideo } from './errorRecovery'

// ============================================================================
// Types
// ============================================================================

/**
 * Versioned export format for cache data
 */
export interface CacheExportData {
  /** Export format version */
  version: 1
  /** When the export was created (ISO 8601) */
  exportedAt: string
  /** App version that created the export */
  appVersion: string
  /** Wallet address this data belongs to */
  walletAddress: string
  /** Number of videos in the export */
  videoCount: number
  /** The cached video records */
  videos: CachedVideo[]
  /** Cache metadata entries */
  metadata: CacheMetadataEntry[]
  /** Checksum for integrity verification */
  checksum: string
}

/**
 * Result of an import operation
 */
export interface ImportResult {
  success: boolean
  imported: number
  skipped: number
  errors: string[]
  message: string
}

/**
 * Import options
 */
export interface ImportOptions {
  /** Whether to overwrite existing entries */
  overwrite?: boolean
  /** Merge strategy for conflicting video IDs */
  mergeStrategy?: 'keep-existing' | 'prefer-import'
  /** Maximum file size in bytes (default: 50MB) */
  maxFileSize?: number
}

/**
 * Validation result for export data
 */
interface ValidationResult {
  valid: boolean
  errors: string[]
}

// ============================================================================
// Export Functions
// ============================================================================

/**
 * Export all cached data for a wallet address.
 * Returns a structured object with videos, metadata, and checksum.
 *
 * @param walletAddress - The wallet address to export data for
 * @returns CacheExportData object ready for serialization
 */
export async function exportCacheData(walletAddress: string): Promise<CacheExportData> {
  // Get all cached videos (raw CachedVideo, not converted to Video)
  const videos = await getAllCachedVideos(walletAddress)

  // Get all metadata entries
  const metadata = await getAllCacheMetadata(walletAddress)

  // Compute checksum for integrity verification
  const dataString = JSON.stringify({ videos, metadata })
  const checksum = await computeChecksum(dataString)

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    appVersion: getAppVersion(),
    walletAddress: walletAddress.toLowerCase(),
    videoCount: videos.length,
    videos,
    metadata,
    checksum,
  }
}

/**
 * Trigger a download of the exported cache data as a JSON file.
 *
 * @param data - The CacheExportData to download
 */
export function downloadExport(data: CacheExportData): void {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = `haven-library-${data.walletAddress.slice(0, 8)}-${formatDate(new Date())}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ============================================================================
// Import Functions
// ============================================================================

/**
 * Import cached data from a JSON file.
 * Validates the file format, checksum, and wallet address before importing.
 *
 * @param file - The JSON file to import
 * @param walletAddress - The current wallet address (must match export)
 * @param options - Import options (overwrite, mergeStrategy, maxFileSize)
 * @returns ImportResult with success status and details
 */
export async function importCacheData(
  file: File,
  walletAddress: string,
  options: ImportOptions = {}
): Promise<ImportResult> {
  const {
    overwrite = false,
    mergeStrategy = 'keep-existing',
    maxFileSize = 50 * 1024 * 1024, // 50MB default
  } = options

  const result: ImportResult = {
    success: false,
    imported: 0,
    skipped: 0,
    errors: [],
    message: '',
  }

  try {
    // 1. Check file size
    if (file.size > maxFileSize) {
      result.errors.push(`File size (${formatBytes(file.size)}) exceeds maximum (${formatBytes(maxFileSize)})`)
      result.message = 'File too large'
      return result
    }

    // 2. Read and parse file
    let data: CacheExportData
    try {
      const text = await file.text()
      data = JSON.parse(text) as CacheExportData
    } catch (error) {
      result.errors.push('Invalid JSON file')
      result.message = 'Failed to parse file'
      return result
    }

    // 3. Validate export format
    const validation = validateExportData(data)
    if (!validation.valid) {
      result.errors = validation.errors
      result.message = 'Invalid export file format'
      return result
    }

    // 4. Verify wallet address matches
    if (data.walletAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      result.errors.push(
        `Export is for wallet ${data.walletAddress.slice(0, 8)}... ` +
          `but current wallet is ${walletAddress.slice(0, 8)}...`
      )
      result.message = 'Wallet address mismatch'
      return result
    }

    // 5. Verify checksum (warn but don't block on mismatch)
    const dataString = JSON.stringify({ videos: data.videos, metadata: data.metadata })
    const expectedChecksum = await computeChecksum(dataString)
    if (expectedChecksum !== data.checksum) {
      result.errors.push('Checksum mismatch — file may be corrupted')
      // Continue anyway — warn but don't block
    }

    // 6. Import videos with merge strategy
    const existingVideos = await getAllCachedVideos(walletAddress)
    const existingIds = new Set(existingVideos.map((v) => v.id))

    const toImport: CachedVideo[] = []
    for (const video of data.videos) {
      if (existingIds.has(video.id)) {
        if (mergeStrategy === 'prefer-import' || overwrite) {
          toImport.push(video)
          result.imported++
        } else {
          result.skipped++
        }
      } else {
        toImport.push(video)
        result.imported++
      }
    }

    // 7. Write to IndexedDB
    if (toImport.length > 0) {
      await putCachedVideos(walletAddress, toImport)
    }

    result.success = true
    result.message = `Imported ${result.imported} videos, skipped ${result.skipped}`
    return result
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : 'Unknown error')
    result.message = 'Failed to import cache data'
    return result
  }
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate that an unknown object is a valid CacheExportData.
 * Checks all required fields, types, and basic structure.
 *
 * @param data - The object to validate
 * @returns ValidationResult with valid flag and any errors
 */
export function validateExportData(data: unknown): ValidationResult {
  const errors: string[] = []

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Not a valid JSON object'] }
  }

  const d = data as Record<string, unknown>

  // Check version
  if (d.version !== 1) {
    errors.push(`Unsupported export version: ${d.version}`)
  }

  // Check wallet address
  if (typeof d.walletAddress !== 'string' || !d.walletAddress) {
    errors.push('Missing or invalid wallet address')
  }

  // Check videos array
  if (!Array.isArray(d.videos)) {
    errors.push('Missing or invalid videos array')
  }

  // Check metadata array (optional but should be array if present)
  if (d.metadata !== undefined && !Array.isArray(d.metadata)) {
    errors.push('Invalid metadata array')
  }

  // Check checksum
  if (typeof d.checksum !== 'string' || !d.checksum) {
    errors.push('Missing or invalid checksum')
  }

  // Validate individual video records (check first 5 for performance)
  if (Array.isArray(d.videos)) {
    for (let i = 0; i < Math.min(d.videos.length, 5); i++) {
      if (!isValidCachedVideo(d.videos[i])) {
        errors.push(`Invalid video record at index ${i}`)
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

// ============================================================================
// Checksum Utility
// ============================================================================

/**
 * Compute SHA-256 checksum of a string.
 * Uses the Web Crypto API for secure hashing.
 *
 * @param data - The string to hash
 * @returns Hex string of the SHA-256 hash
 */
export async function computeChecksum(data: string): Promise<string> {
  const encoder = new TextEncoder()
  const buffer = encoder.encode(data)
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get the app version from environment or fallback.
 * Works in both Node.js and browser environments.
 */
function getAppVersion(): string {
  // Try to get from environment (Next.js, Vite, etc.)
  if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_APP_VERSION) {
    return process.env.NEXT_PUBLIC_APP_VERSION
  }

  // Try Vite-style import.meta.env
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const importMeta = (globalThis as any).import?.meta?.env
  if (importMeta?.VITE_APP_VERSION) {
    return importMeta.VITE_APP_VERSION
  }

  // Fallback version
  return '0.1.0'
}

/**
 * Format a date as YYYY-MM-DD for filenames.
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

/**
 * Format bytes to human-readable string.
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}
