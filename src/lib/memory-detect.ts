/**
 * Memory Pressure Detection & Adaptive Strategy
 *
 * Provides runtime memory pressure detection to dynamically choose between
 * in-memory and OPFS-staged decryption pipelines. On constrained devices,
 * automatically uses the memory-efficient path; on powerful desktops, uses
 * the faster in-memory path.
 *
 * ## Problem Solved
 *
 * Not all devices are equal. A desktop with 32GB RAM can comfortably decrypt
 * a 500MB video entirely in memory. A mobile phone with 3GB RAM cannot.
 * Rather than always using the slower OPFS path or always risking OOM crashes,
 * we detect the device's capabilities and choose the optimal strategy.
 *
 * @module lib/memory-detect
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Navigator/deviceMemory
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Performance/memory
 */

import { isOpfsAvailable } from './opfs'
import { formatBytes } from './crypto'

// ============================================================================
// Types
// ============================================================================

/**
 * Memory information gathered from available browser APIs.
 */
export interface MemoryInfo {
  /** Total device memory in bytes (from navigator.deviceMemory, 0 if unavailable) */
  deviceMemory: number

  /** Current JS heap size in bytes (from performance.memory, 0 if unavailable) */
  jsHeapUsed: number

  /** JS heap size limit in bytes (0 if unavailable) */
  jsHeapLimit: number

  /** Estimated available memory for decryption */
  estimatedAvailable: number

  /** Whether memory APIs are available */
  hasMemoryApi: boolean

  /** Whether this is likely a constrained device */
  isConstrained: boolean
}

/**
 * Decryption strategy decision with reasoning and estimates.
 */
export interface DecryptionStrategy {
  /** The chosen decryption mode */
  mode: 'in-memory' | 'opfs-staged' | 'too-large'

  /** Human-readable reason for the choice */
  reason: string

  /** Estimated peak memory usage for this strategy */
  estimatedPeakMemory: number

  /** Estimated available memory at decision time */
  estimatedAvailableMemory: number

  /** Optional warning message for the user */
  warningMessage?: string
}

/**
 * User warning information for large files.
 */
export interface UserWarning {
  /** Whether a warning should be shown */
  shouldWarn: boolean

  /** Warning message to display */
  message: string

  /** Suggested action for the user */
  suggestion?: string
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default estimated available memory when APIs are unavailable (512MB).
 * This is a conservative estimate for older or restricted devices.
 */
const DEFAULT_ESTIMATED_MEMORY = 512 * 1024 * 1024

/**
 * Threshold for considering a device "constrained" (4GB).
 */
const CONSTRAINED_MEMORY_THRESHOLD_GB = 4

/**
 * Memory multiplier for in-memory decryption:
 * - Original encrypted data (1x)
 * - Decrypted output (1x)
 * - Blob for URL.createObjectURL (1x)
 */
const IN_MEMORY_MULTIPLIER = 3

/**
 * Memory multiplier for OPFS-staged decryption:
 * - Read from disk (streaming, minimal)
 * - Decrypted output (1x)
 * - Some overhead for buffers (1x)
 */
const OPFS_STAGED_MULTIPLIER = 2

/**
 * Safety factor for in-memory threshold (70% of available).
 * Leaves headroom for other JS heap usage.
 */
const IN_MEMORY_THRESHOLD_FACTOR = 0.7

/**
 * Safety factor for OPFS-staged threshold (80% of available).
 */
const OPFS_STAGED_THRESHOLD_FACTOR = 0.8

/**
 * Safety factor for in-memory with warning (90% of available).
 */
const IN_MEMORY_WARNING_THRESHOLD_FACTOR = 0.9

// ============================================================================
// Memory Detection
// ============================================================================

/**
 * Gather device memory information from available browser APIs.
 *
 * Uses `navigator.deviceMemory` (Chrome/Edge) for total RAM estimate and
 * `performance.memory` (Chrome) for current JS heap usage. Falls back to
 * conservative defaults when APIs are unavailable.
 *
 * @returns MemoryInfo object with memory details and constraints
 *
 * @example
 * ```typescript
 * const memory = getMemoryInfo()
 * console.log(`Device has ${formatBytes(memory.deviceMemory)} RAM`)
 * console.log(`Estimated available: ${formatBytes(memory.estimatedAvailable)}`)
 * if (memory.isConstrained) {
 *   console.log('This is a constrained device')
 * }
 * ```
 */
export function getMemoryInfo(): MemoryInfo {
  // Get device memory from navigator.deviceMemory (Chrome/Edge)
  // Returns approximate RAM in GB (0.25, 0.5, 1, 2, 4, 8)
  const deviceMemoryGB = (navigator as Navigator & { deviceMemory?: number }).deviceMemory || 0
  const deviceMemory = deviceMemoryGB * 1024 * 1024 * 1024

  // Get JS heap info from performance.memory (Chrome only)
  const perfMemory = (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory
  const jsHeapUsed = perfMemory?.usedJSHeapSize || 0
  const jsHeapLimit = perfMemory?.jsHeapSizeLimit || 0

  // Estimate available memory
  let estimatedAvailable: number

  if (jsHeapLimit > 0) {
    // Best case: we know the heap limit
    estimatedAvailable = jsHeapLimit - jsHeapUsed
  } else if (deviceMemory > 0) {
    // Rough estimate: assume 50% of device memory is available for JS
    estimatedAvailable = deviceMemory * 0.5
  } else {
    // No info: use conservative default
    estimatedAvailable = DEFAULT_ESTIMATED_MEMORY
  }

  // Detect constrained devices
  // - Devices with 4GB or less RAM
  // - Mobile devices (iPhone, iPad, iPod, Android)
  const isConstrained =
    (deviceMemoryGB > 0 && deviceMemoryGB <= CONSTRAINED_MEMORY_THRESHOLD_GB) ||
    /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

  return {
    deviceMemory,
    jsHeapUsed,
    jsHeapLimit,
    estimatedAvailable,
    hasMemoryApi: jsHeapLimit > 0 || deviceMemory > 0,
    isConstrained,
  }
}

// ============================================================================
// Strategy Selection
// ============================================================================

/**
 * Determine the optimal decryption strategy based on file size and available memory.
 *
 * Analyzes the device's memory capabilities and the encrypted file size to choose
 * between in-memory decryption (fastest), OPFS-staged decryption (memory-efficient),
 * or rejecting the file as too large.
 *
 * @param fileSize - Size of the encrypted file in bytes
 * @returns DecryptionStrategy with mode, reasoning, and estimates
 *
 * @example
 * ```typescript
 * const strategy = getDecryptionStrategy(500 * 1024 * 1024) // 500MB file
 *
 * if (strategy.mode === 'too-large') {
 *   showError(strategy.warningMessage)
 *   return
 * }
 *
 * if (strategy.warningMessage) {
 *   showWarning(strategy.warningMessage)
 * }
 *
 * if (strategy.mode === 'opfs-staged') {
 *   // Use OPFS pipeline
 * } else {
 *   // Use in-memory pipeline
 * }
 * ```
 */
export function getDecryptionStrategy(fileSize: number): DecryptionStrategy {
  const memory = getMemoryInfo()

  // Calculate peak memory usage for each strategy
  const inMemoryPeak = fileSize * IN_MEMORY_MULTIPLIER
  const opfsStagedPeak = fileSize * OPFS_STAGED_MULTIPLIER

  // Fast path: plenty of memory for in-memory decryption
  if (inMemoryPeak < memory.estimatedAvailable * IN_MEMORY_THRESHOLD_FACTOR) {
    return {
      mode: 'in-memory',
      reason: `File (${formatBytes(fileSize)}) fits comfortably in available memory (${formatBytes(memory.estimatedAvailable)})`,
      estimatedPeakMemory: inMemoryPeak,
      estimatedAvailableMemory: memory.estimatedAvailable,
    }
  }

  // OPFS path: moderate memory pressure, but OPFS is available
  if (opfsStagedPeak < memory.estimatedAvailable * OPFS_STAGED_THRESHOLD_FACTOR && isOpfsAvailable()) {
    return {
      mode: 'opfs-staged',
      reason: `File (${formatBytes(fileSize)}) too large for in-memory, using OPFS staging`,
      estimatedPeakMemory: opfsStagedPeak,
      estimatedAvailableMemory: memory.estimatedAvailable,
      warningMessage: memory.isConstrained
        ? 'This is a large file. Decryption may take longer on this device.'
        : undefined,
    }
  }

  // In-memory with warning (no OPFS available, but file might still fit)
  if (opfsStagedPeak < memory.estimatedAvailable * IN_MEMORY_WARNING_THRESHOLD_FACTOR) {
    return {
      mode: 'in-memory',
      reason: `OPFS not available, using in-memory with warning`,
      estimatedPeakMemory: inMemoryPeak,
      estimatedAvailableMemory: memory.estimatedAvailable,
      warningMessage: 'This file is large and may cause performance issues on this device.',
    }
  }

  // Too large: file exceeds all available strategies
  return {
    mode: 'too-large',
    reason: `File (${formatBytes(fileSize)}) exceeds available memory (${formatBytes(memory.estimatedAvailable)})`,
    estimatedPeakMemory: opfsStagedPeak,
    estimatedAvailableMemory: memory.estimatedAvailable,
    warningMessage: 'This file is too large to decrypt on this device.',
  }
}

// ============================================================================
// User Warning
// ============================================================================

/**
 * Determine if a warning should be shown to the user for a given file size.
 *
 * Returns warning information when the file is large relative to available
 * memory, helping users understand potential performance issues before
 * decryption begins.
 *
 * @param fileSize - Size of the encrypted file in bytes
 * @returns UserWarning with warning status and message
 *
 * @example
 * ```typescript
 * const warning = shouldWarnUser(500 * 1024 * 1024)
 * if (warning.shouldWarn) {
 *   showToast(warning.message)
 * }
 * ```
 */
export function shouldWarnUser(fileSize: number): UserWarning {
  const memory = getMemoryInfo()
  const inMemoryPeak = fileSize * IN_MEMORY_MULTIPLIER
  const opfsStagedPeak = fileSize * OPFS_STAGED_MULTIPLIER

  // File is definitely too large
  if (opfsStagedPeak >= memory.estimatedAvailable * IN_MEMORY_WARNING_THRESHOLD_FACTOR) {
    return {
      shouldWarn: true,
      message: 'This file is too large to decrypt on this device.',
      suggestion: 'Try on a device with more memory or ask for a smaller file.',
    }
  }

  // File fits but will use significant memory
  if (inMemoryPeak >= memory.estimatedAvailable * IN_MEMORY_THRESHOLD_FACTOR) {
    const opfsAvailable = isOpfsAvailable()

    if (opfsAvailable && memory.isConstrained) {
      return {
        shouldWarn: true,
        message: 'This is a large file. Decryption may take longer on this device.',
        suggestion: 'Keep this tab active during decryption for best performance.',
      }
    }

    if (!opfsAvailable) {
      return {
        shouldWarn: true,
        message: 'This file is large and may cause performance issues on this device.',
        suggestion: 'Consider using a modern browser like Chrome or Edge for better support.',
      }
    }
  }

  // No warning needed
  return {
    shouldWarn: false,
    message: '',
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if the device is likely constrained (low memory or mobile).
 *
 * @returns true if the device is likely constrained
 *
 * @example
 * ```typescript
 * if (isConstrainedDevice()) {
 *   // Use memory-efficient defaults
 *   setUseOpfsByDefault(true)
 * }
 * ```
 */
export function isConstrainedDevice(): boolean {
  return getMemoryInfo().isConstrained
}

/**
 * Get a human-readable summary of the device's memory status.
 *
 * @returns Object with formatted strings for display
 *
 * @example
 * ```typescript
 * const summary = getMemorySummary()
 * console.log(summary.deviceMemory) // "Device: 8 GB"
 * console.log(summary.available)    // "Available: ~4.2 GB"
 * console.log(summary.status)       // "Status: Constrained"
 * ```
 */
export function getMemorySummary(): {
  deviceMemory: string
  jsHeapUsed: string
  jsHeapLimit: string
  available: string
  status: string
  hasMemoryApi: boolean
} {
  const memory = getMemoryInfo()

  return {
    deviceMemory: memory.deviceMemory > 0 ? formatBytes(memory.deviceMemory) : 'Unknown',
    jsHeapUsed: memory.jsHeapUsed > 0 ? formatBytes(memory.jsHeapUsed) : 'Unknown',
    jsHeapLimit: memory.jsHeapLimit > 0 ? formatBytes(memory.jsHeapLimit) : 'Unknown',
    available: formatBytes(memory.estimatedAvailable),
    status: memory.isConstrained ? 'Constrained' : 'Capable',
    hasMemoryApi: memory.hasMemoryApi,
  }
}
