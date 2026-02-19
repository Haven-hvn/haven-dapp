/**
 * Buffer Lifecycle Manager
 *
 * Provides aggressive memory cleanup for the decryption pipeline to ensure
 * intermediate buffers are released as soon as they're no longer needed,
 * rather than waiting for JavaScript's non-deterministic garbage collector.
 *
 * During video decryption, several large buffers are created that should be
 * released immediately to prevent OOM crashes on constrained devices:
 * - Encrypted data buffer (after decryption starts)
 * - AES key (after decryption completes)
 * - Decrypted data buffer (after writing to Cache API)
 * - IV buffer (after decryption completes)
 *
 * @module lib/buffer-lifecycle
 * @see ../hooks/useVideoDecryption.ts - Primary integration point
 */

import { formatBytes } from './crypto'

// ============================================================================
// Types
// ============================================================================

/**
 * A tracked buffer with metadata for lifecycle management.
 */
interface TrackedBuffer {
  /** Human-readable name for debugging */
  name: string
  /** The tracked Uint8Array */
  buffer: Uint8Array
  /** Size in bytes */
  size: number
  /** High-resolution timestamp when tracked */
  createdAt: number
}

/**
 * Statistics for a tracked buffer.
 */
export interface BufferStats {
  /** Buffer name */
  name: string
  /** Size in bytes */
  size: number
  /** Age in milliseconds since tracking started */
  age: number
}

// ============================================================================
// Buffer Lifecycle Manager
// ============================================================================

/**
 * Manages the lifecycle of ArrayBuffers during decryption operations.
 *
 * Tracks buffers and provides eager cleanup through zero-filling and
 * ArrayBuffer detachment for immediate memory reclamation.
 *
 * @example
 * ```typescript
 * const lifecycle = createBufferLifecycle()
 *
 * try {
 *   lifecycle.track('encrypted', encryptedData)
 *   lifecycle.track('aesKey', aesKey)
 *
 *   const decrypted = await aesDecrypt(encryptedData, aesKey, iv)
 *   lifecycle.track('decrypted', decrypted)
 *
 *   // Release buffers no longer needed
 *   lifecycle.release('encrypted')
 *   lifecycle.release('aesKey')
 *
 *   await putVideo(videoId, decrypted)
 *   lifecycle.release('decrypted')
 * } catch (err) {
 *   lifecycle.releaseAll()
 *   throw err
 * }
 * ```
 */
export class BufferLifecycleManager {
  private buffers = new Map<string, TrackedBuffer>()

  /**
   * Register a buffer for lifecycle tracking.
   *
   * Stores a reference with a human-readable name for debugging,
   * along with creation time and size.
   *
   * @param name - Human-readable name for debugging (e.g., 'encrypted', 'aesKey')
   * @param buffer - The Uint8Array to track
   *
   * @example
   * ```typescript
   * lifecycle.track('encrypted', encryptedData)
   * ```
   */
  track(name: string, buffer: Uint8Array): void {
    this.buffers.set(name, {
      name,
      buffer,
      size: buffer.byteLength,
      createdAt: performance.now(),
    })
  }

  /**
   * Eagerly release a tracked buffer.
   *
   * Performs secure cleanup:
   * 1. Zero-fills the buffer (security: clear sensitive data like keys)
   * 2. Attempts to detach the underlying ArrayBuffer via MessageChannel transfer
   * 3. Removes from tracking
   * 4. Logs the release in development mode
   *
   * @param name - Name of the buffer to release
   *
   * @example
   * ```typescript
   * lifecycle.release('aesKey') // Clear sensitive key from memory
   * ```
   */
  release(name: string): void {
    const tracked = this.buffers.get(name)
    if (!tracked) return

    const { buffer, size, createdAt } = tracked
    const age = performance.now() - createdAt

    // Step 1: Zero-fill for security (clear sensitive data like keys)
    try {
      buffer.fill(0)
    } catch {
      // Buffer may already be detached
    }

    // Step 2: Attempt to detach the underlying ArrayBuffer
    // This transfers ownership to force immediate memory reclamation
    // rather than waiting for garbage collection
    try {
      const ab = buffer.buffer
      // Only attempt to detach ArrayBuffer (not SharedArrayBuffer)
      if (ab.byteLength > 0 && ab instanceof ArrayBuffer) {
        // Transfer ownership to detach - the ArrayBuffer is moved to the
        // MessageChannel and becomes detached in the current context
        const channel = new MessageChannel()
        channel.port1.postMessage(null, [ab])
        channel.port1.close()
        channel.port2.close()
      }
    } catch {
      // Detach not possible (shared buffer, already detached, etc.)
      // Fall back to letting GC handle it
    }

    this.buffers.delete(name)

    if (process.env.NODE_ENV === 'development') {
      console.debug(
        `[BufferLifecycle] Released '${name}' (${formatBytes(size)}) ` +
          `after ${age.toFixed(0)}ms`
      )
    }
  }

  /**
   * Release all tracked buffers.
   *
   * Called on error or cleanup to ensure no memory leaks.
   * Iterates through all tracked buffers and releases each one.
   *
   * @example
   * ```typescript
   * try {
   *   // ... decryption logic ...
   * } catch (err) {
   *   lifecycle.releaseAll() // Cleanup on error
   *   throw err
   * }
   * ```
   */
  releaseAll(): void {
    // Create a copy of keys since release() modifies the Map
    const names = Array.from(this.buffers.keys())
    for (const name of names) {
      this.release(name)
    }
  }

  /**
   * Get statistics for all currently tracked buffers.
   *
   * Useful for debugging memory issues. Returns array of buffer stats
   * including name, size, and age.
   *
   * @returns Array of buffer statistics
   *
   * @example
   * ```typescript
   * const stats = lifecycle.getStats()
   * console.log(`Tracked ${stats.length} buffers:`)
   * stats.forEach(s => console.log(`  ${s.name}: ${formatBytes(s.size)}`))
   * ```
   */
  getStats(): BufferStats[] {
    return Array.from(this.buffers.values()).map((b) => ({
      name: b.name,
      size: b.size,
      age: performance.now() - b.createdAt,
    }))
  }

  /**
   * Get the total size of all tracked buffers.
   *
   * @returns Total size in bytes
   *
   * @example
   * ```typescript
   * const totalSize = lifecycle.getTotalSize()
   * console.log(`Total tracked: ${formatBytes(totalSize)}`)
   * ```
   */
  getTotalSize(): number {
    let total = 0
    for (const b of Array.from(this.buffers.values())) {
      total += b.size
    }
    return total
  }

  /**
   * Check if a buffer with the given name is being tracked.
   *
   * @param name - Buffer name to check
   * @returns true if the buffer is tracked
   */
  has(name: string): boolean {
    return this.buffers.has(name)
  }

  /**
   * Get the number of currently tracked buffers.
   */
  get count(): number {
    return this.buffers.size
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new BufferLifecycleManager instance.
 *
 * Each decryption operation should have its own lifecycle manager
 * to track and clean up its buffers independently.
 *
 * @returns New BufferLifecycleManager instance
 *
 * @example
 * ```typescript
 * const lifecycle = createBufferLifecycle()
 *
 * try {
 *   lifecycle.track('encrypted', encryptedData)
 *   // ... use buffer ...
 * } finally {
 *   lifecycle.releaseAll()
 * }
 * ```
 */
export function createBufferLifecycle(): BufferLifecycleManager {
  return new BufferLifecycleManager()
}

// ============================================================================
// Standalone Utility Functions
// ============================================================================

/**
 * Detach an ArrayBuffer to force immediate memory reclamation.
 *
 * Uses the MessageChannel transfer trick to detach the buffer.
 * After detachment, the buffer's byteLength becomes 0 and it can
 * no longer be accessed.
 *
 * @param buffer - The ArrayBuffer to detach
 * @returns true if detachment succeeded, false otherwise
 *
 * @example
 * ```typescript
 * const buffer = new ArrayBuffer(1024)
 * detachArrayBuffer(buffer)
 * console.log(buffer.byteLength) // 0 (detached)
 * ```
 */
export function detachArrayBuffer(buffer: ArrayBuffer): boolean {
  try {
    if (buffer.byteLength === 0) {
      return false // Already detached or empty
    }

    const channel = new MessageChannel()
    channel.port1.postMessage(null, [buffer])
    channel.port1.close()
    channel.port2.close()

    return buffer.byteLength === 0 // Verify detachment
  } catch {
    return false
  }
}

/**
 * Securely clear a Uint8Array by zero-filling and attempting to detach.
 *
 * This is a convenience function for one-off buffer cleanup.
 * For managing multiple buffers, use BufferLifecycleManager instead.
 *
 * @param buffer - The buffer to clear
 * @returns true if clearing succeeded (including detachment)
 *
 * @example
 * ```typescript
 * const key = await generateAESKey()
 * // ... use key ...
 * secureClearBuffer(key)
 * ```
 */
export function secureClearBuffer(buffer: Uint8Array): boolean {
  try {
    // Zero-fill
    buffer.fill(0)

    // Attempt to detach (only for ArrayBuffer, not SharedArrayBuffer)
    const ab = buffer.buffer
    if (ab instanceof ArrayBuffer) {
      detachArrayBuffer(ab)
    }

    return true
  } catch {
    return false
  }
}
