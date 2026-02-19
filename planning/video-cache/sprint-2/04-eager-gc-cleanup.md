# Task 2.4: Eager Garbage Collection & Buffer Cleanup

## Objective

Implement aggressive memory cleanup throughout the decryption pipeline to ensure intermediate buffers are released as soon as they're no longer needed, rather than waiting for JavaScript's garbage collector.

## Background

JavaScript's garbage collector is non-deterministic — it may not reclaim large `ArrayBuffer` allocations immediately. During video decryption, we create several large buffers that should be released as soon as possible:

1. The encrypted data buffer (after decryption starts)
2. The AES key (after decryption completes)
3. The decrypted data buffer (after writing to Cache API)
4. The IV buffer (after decryption completes)

Currently, these buffers linger in memory until the GC decides to collect them, which can be many seconds or even minutes later. On constrained devices, this delay can cause OOM crashes.

## Requirements

### Buffer Lifecycle Manager (`src/lib/buffer-lifecycle.ts`)

1. **`trackBuffer(name, buffer)`** — Register a buffer for lifecycle tracking
   - Store a reference with a human-readable name for debugging
   - Track creation time and size

2. **`releaseBuffer(name)`** — Eagerly release a tracked buffer
   - Zero-fill the buffer (security: clear sensitive data)
   - Detach the underlying `ArrayBuffer` if possible (via `structuredClone` trick or `transfer`)
   - Remove from tracking
   - Log the release for debugging

3. **`releaseAll()`** — Release all tracked buffers
   - Called on error or cleanup

4. **`getBufferStats()`** — Return current tracked buffer sizes
   - Useful for debugging memory issues

### Detaching ArrayBuffers

Modern browsers support transferring `ArrayBuffer` ownership, which effectively detaches the buffer from the original `Uint8Array`:

```typescript
function detachBuffer(buffer: ArrayBuffer): void {
  try {
    // Transfer to a MessageChannel to detach
    const channel = new MessageChannel()
    channel.port1.postMessage(null, [buffer])
    channel.port1.close()
    channel.port2.close()
  } catch {
    // Fallback: just let GC handle it
  }
}
```

### Pipeline Integration Points

Update the decryption pipeline to release buffers at each stage:

```
Stage 1: Synapse Fetch
  → encryptedData created
  → Track: trackBuffer('encrypted', encryptedData)

Stage 2: AES Key Decryption
  → aesKey created
  → Track: trackBuffer('aesKey', aesKey)

Stage 3: File Decryption
  → decryptedData created
  → Track: trackBuffer('decrypted', decryptedData)
  → Release: releaseBuffer('encrypted')  ← no longer needed
  → Release: releaseBuffer('aesKey')     ← no longer needed

Stage 4: Cache Write
  → putVideo(videoId, decryptedData)
  → Release: releaseBuffer('decrypted')  ← now on disk

Stage 5: Cleanup
  → releaseAll() for safety
```

## Implementation Details

### Buffer Lifecycle Manager

```typescript
// src/lib/buffer-lifecycle.ts

interface TrackedBuffer {
  name: string
  buffer: Uint8Array
  size: number
  createdAt: number
}

class BufferLifecycleManager {
  private buffers = new Map<string, TrackedBuffer>()
  
  track(name: string, buffer: Uint8Array): void {
    this.buffers.set(name, {
      name,
      buffer,
      size: buffer.byteLength,
      createdAt: performance.now(),
    })
  }
  
  release(name: string): void {
    const tracked = this.buffers.get(name)
    if (!tracked) return
    
    const { buffer, size } = tracked
    
    // Step 1: Zero-fill for security (clear sensitive data like keys)
    try {
      buffer.fill(0)
    } catch {
      // Buffer may already be detached
    }
    
    // Step 2: Attempt to detach the underlying ArrayBuffer
    try {
      const ab = buffer.buffer
      if (ab.byteLength > 0) {
        // Transfer ownership to detach
        const channel = new MessageChannel()
        channel.port1.postMessage(null, [ab])
        channel.port1.close()
        channel.port2.close()
      }
    } catch {
      // Detach not possible (shared buffer, already detached, etc.)
    }
    
    this.buffers.delete(name)
    
    if (process.env.NODE_ENV === 'development') {
      console.debug(
        `[BufferLifecycle] Released '${name}' (${formatBytes(size)}) ` +
        `after ${(performance.now() - tracked.createdAt).toFixed(0)}ms`
      )
    }
  }
  
  releaseAll(): void {
    for (const name of this.buffers.keys()) {
      this.release(name)
    }
  }
  
  getStats(): { name: string; size: number; age: number }[] {
    return Array.from(this.buffers.values()).map(b => ({
      name: b.name,
      size: b.size,
      age: performance.now() - b.createdAt,
    }))
  }
  
  getTotalSize(): number {
    let total = 0
    for (const b of this.buffers.values()) {
      total += b.size
    }
    return total
  }
}

// Singleton per decryption operation
export function createBufferLifecycle(): BufferLifecycleManager {
  return new BufferLifecycleManager()
}
```

### Integration with `useVideoDecryption`

```typescript
// In the decrypt() function of useVideoDecryption.ts

const lifecycle = createBufferLifecycle()

try {
  // Track encrypted data
  lifecycle.track('encrypted', encryptedData)
  
  // Decrypt AES key
  const { aesKey } = await decryptAesKey({ ... })
  lifecycle.track('aesKey', aesKey)
  
  // Decrypt file
  const iv = base64ToUint8Array(video.litEncryptionMetadata.iv)
  const decryptedData = await aesDecrypt(encryptedData, aesKey, iv)
  lifecycle.track('decrypted', decryptedData)
  
  // Release encrypted data and key — no longer needed
  lifecycle.release('encrypted')
  lifecycle.release('aesKey')
  
  // Write to cache
  await putVideo(video.id, decryptedData, mimeType)
  
  // Release decrypted data — now on disk
  lifecycle.release('decrypted')
  
  return `/haven/v/${video.id}`
  
} catch (err) {
  // Release everything on error
  lifecycle.releaseAll()
  throw err
} finally {
  // Safety net
  lifecycle.releaseAll()
}
```

### Monitoring Hook

```typescript
// Optional: expose buffer stats for debugging
export function useBufferStats() {
  // For development tools / debugging UI
  // Shows current tracked buffers and their sizes
}
```

## Acceptance Criteria

- [ ] `BufferLifecycleManager` tracks buffers with names and sizes
- [ ] `release()` zero-fills buffers before releasing (security)
- [ ] `release()` attempts to detach `ArrayBuffer` for immediate memory reclamation
- [ ] `releaseAll()` cleans up all tracked buffers
- [ ] Encrypted data buffer is released immediately after decryption starts
- [ ] AES key is released immediately after file decryption completes
- [ ] Decrypted data buffer is released immediately after Cache API write
- [ ] All buffers are released on error (no memory leaks on failure)
- [ ] Debug logging shows buffer lifecycle in development mode
- [ ] No regression in decryption functionality

## Dependencies

- Task 2.2 (Decryption-to-Cache Pipeline)

## Estimated Effort

Small-Medium (3-4 hours)