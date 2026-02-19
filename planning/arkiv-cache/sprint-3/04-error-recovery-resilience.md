# Task 3.4 — Error Recovery & Cache Resilience

**Sprint:** 3 — Sync & Resilience  
**Estimate:** 3–4 hours  
**Files:** `src/lib/cache/errorRecovery.ts` (new), `src/lib/cache/db.ts` (modify)

## Objective

Harden the cache layer against real-world failure modes: corrupted IndexedDB data, quota exceeded errors, browser storage eviction, concurrent tab access, and partial write failures. Implement automatic recovery strategies so the cache self-heals without user intervention.

## Background

Browser storage is not as reliable as a traditional database. Common failure modes include:

1. **Quota exceeded** — Browser runs out of storage space
2. **Storage eviction** — Browser evicts IndexedDB data under storage pressure (especially in Firefox/Safari)
3. **Corrupted data** — Power loss or crash during write leaves partial records
4. **Concurrent access** — Multiple tabs writing to the same database
5. **Private browsing** — Some browsers restrict or disable IndexedDB
6. **Version conflicts** — Two tabs running different app versions

## Prerequisites

- Task 3.3 (schema migration strategy)

## Requirements

### 1. Error Classification

```typescript
// src/lib/cache/errorRecovery.ts

export type CacheErrorType =
  | 'QUOTA_EXCEEDED'      // Storage full
  | 'DB_BLOCKED'          // Another tab has an older version open
  | 'DB_CORRUPTED'        // Data integrity check failed
  | 'STORAGE_EVICTED'     // Browser evicted our data
  | 'PERMISSION_DENIED'   // Private browsing or user denied storage
  | 'TRANSACTION_FAILED'  // IndexedDB transaction aborted
  | 'SERIALIZATION_ERROR' // Data can't be serialized/deserialized
  | 'UNKNOWN'             // Unclassified error

export function classifyCacheError(error: unknown): CacheErrorType {
  if (error instanceof DOMException) {
    switch (error.name) {
      case 'QuotaExceededError':
        return 'QUOTA_EXCEEDED'
      case 'VersionError':
      case 'BlockedError':
        return 'DB_BLOCKED'
      case 'AbortError':
        return 'TRANSACTION_FAILED'
      case 'NotAllowedError':
      case 'SecurityError':
        return 'PERMISSION_DENIED'
      case 'DataError':
      case 'DataCloneError':
        return 'SERIALIZATION_ERROR'
      case 'InvalidStateError':
        return 'DB_CORRUPTED'
    }
  }
  
  if (error instanceof Error) {
    if (error.message.includes('quota')) return 'QUOTA_EXCEEDED'
    if (error.message.includes('blocked')) return 'DB_BLOCKED'
    if (error.message.includes('corrupt')) return 'DB_CORRUPTED'
  }

  return 'UNKNOWN'
}
```

### 2. Recovery Strategies

```typescript
export interface RecoveryResult {
  success: boolean
  strategy: string
  message: string
}

export async function recoverFromError(
  errorType: CacheErrorType,
  walletAddress: string
): Promise<RecoveryResult> {
  switch (errorType) {
    case 'QUOTA_EXCEEDED':
      return await handleQuotaExceeded(walletAddress)
    case 'DB_CORRUPTED':
      return await handleCorruption(walletAddress)
    case 'STORAGE_EVICTED':
      return await handleEviction(walletAddress)
    case 'DB_BLOCKED':
      return await handleBlocked(walletAddress)
    case 'PERMISSION_DENIED':
      return handlePermissionDenied()
    case 'TRANSACTION_FAILED':
      return { success: true, strategy: 'retry', message: 'Will retry on next operation' }
    default:
      return { success: false, strategy: 'none', message: 'No recovery strategy available' }
  }
}
```

### 3. Quota Exceeded Recovery

When storage is full, evict least-recently-accessed entries:

```typescript
async function handleQuotaExceeded(walletAddress: string): Promise<RecoveryResult> {
  try {
    const db = await getCacheDB(walletAddress)
    const tx = db.transaction('videos', 'readwrite')
    
    // Get all videos sorted by lastAccessedAt (oldest first)
    const allVideos = await tx.store.index('by-last-synced').getAll()
    allVideos.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt)
    
    // Delete oldest 20% of entries
    const deleteCount = Math.max(1, Math.floor(allVideos.length * 0.2))
    const toDelete = allVideos.slice(0, deleteCount)
    
    // Prefer deleting expired entries first
    const expiredFirst = [
      ...toDelete.filter(v => v.arkivEntityStatus === 'expired'),
      ...toDelete.filter(v => v.arkivEntityStatus !== 'expired'),
    ].slice(0, deleteCount)

    for (const video of expiredFirst) {
      await tx.store.delete(video.id)
    }
    await tx.done

    return {
      success: true,
      strategy: 'evict-lru',
      message: `Evicted ${deleteCount} least-recently-accessed entries to free space`,
    }
  } catch {
    return {
      success: false,
      strategy: 'evict-lru',
      message: 'Failed to evict entries — storage may be critically full',
    }
  }
}
```

### 4. Corruption Recovery

When data integrity checks fail:

```typescript
async function handleCorruption(walletAddress: string): Promise<RecoveryResult> {
  try {
    // Strategy 1: Try to salvage valid records
    const db = await getCacheDB(walletAddress)
    const tx = db.transaction('videos', 'readwrite')
    let cursor = await tx.store.openCursor()
    let removed = 0

    while (cursor) {
      try {
        // Validate record structure
        const video = cursor.value
        if (!isValidCachedVideo(video)) {
          await cursor.delete()
          removed++
        }
      } catch {
        // Record is unreadable — delete it
        await cursor.delete()
        removed++
      }
      cursor = await cursor.continue()
    }
    await tx.done

    if (removed > 0) {
      return {
        success: true,
        strategy: 'remove-corrupted',
        message: `Removed ${removed} corrupted record(s). Data will be re-fetched from Arkiv.`,
      }
    }

    // Strategy 2: If everything seems corrupted, nuke and rebuild
    return await handleFullReset(walletAddress)
  } catch {
    return await handleFullReset(walletAddress)
  }
}

async function handleFullReset(walletAddress: string): Promise<RecoveryResult> {
  try {
    closeCacheDB(walletAddress)
    await deleteDatabase(walletAddress)
    return {
      success: true,
      strategy: 'full-reset',
      message: 'Cache database reset. Data will be re-fetched from Arkiv.',
    }
  } catch {
    return {
      success: false,
      strategy: 'full-reset',
      message: 'Failed to reset cache database.',
    }
  }
}
```

### 5. Data Validation

```typescript
export function isValidCachedVideo(data: unknown): data is CachedVideo {
  if (!data || typeof data !== 'object') return false
  
  const video = data as Record<string, unknown>
  
  // Check required fields
  if (typeof video.id !== 'string') return false
  if (typeof video.owner !== 'string') return false
  if (typeof video.title !== 'string') return false
  if (typeof video.duration !== 'number') return false
  if (typeof video.isEncrypted !== 'boolean') return false
  if (typeof video.cachedAt !== 'number') return false
  if (typeof video.lastSyncedAt !== 'number') return false
  if (typeof video.cacheVersion !== 'number') return false
  if (!['active', 'expired', 'unknown'].includes(video.arkivEntityStatus as string)) return false
  
  // Check for NaN dates
  if (isNaN(video.cachedAt as number)) return false
  if (isNaN(video.lastSyncedAt as number)) return false
  
  return true
}
```

### 6. Storage Eviction Detection

Detect when the browser has evicted our data:

```typescript
async function handleEviction(walletAddress: string): Promise<RecoveryResult> {
  // Check if our database still exists
  const databases = await indexedDB.databases()
  const dbName = `haven-cache-${walletAddress.toLowerCase()}`
  const exists = databases.some(db => db.name === dbName)

  if (!exists) {
    // Database was evicted — re-create it
    closeCacheDB(walletAddress) // Clear stale connection
    await getCacheDB(walletAddress) // Re-create
    return {
      success: true,
      strategy: 'recreate',
      message: 'Cache was evicted by browser. Re-created empty cache.',
    }
  }

  // Database exists but may be empty
  const count = await getCacheCount(walletAddress)
  if (count === 0) {
    return {
      success: true,
      strategy: 'refill',
      message: 'Cache was emptied by browser. Will re-populate on next sync.',
    }
  }

  return { success: true, strategy: 'none', message: 'Cache appears intact.' }
}
```

### 7. Storage Persistence Request

Request persistent storage to prevent browser eviction:

```typescript
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  
  try {
    const isPersisted = await navigator.storage.persisted()
    if (isPersisted) return true
    
    // Request persistence (browser may show a prompt)
    const granted = await navigator.storage.persist()
    console.info(`[Cache] Persistent storage ${granted ? 'granted' : 'denied'}`)
    return granted
  } catch {
    return false
  }
}

export async function getStorageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null
  
  try {
    const estimate = await navigator.storage.estimate()
    return {
      usage: estimate.usage || 0,
      quota: estimate.quota || 0,
    }
  } catch {
    return null
  }
}
```

### 8. Wrap All DB Operations

Create a resilient wrapper for all database operations:

```typescript
export async function withErrorRecovery<T>(
  operation: () => Promise<T>,
  walletAddress: string,
  fallback: T
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    const errorType = classifyCacheError(error)
    console.warn(`[Cache] Operation failed (${errorType}):`, error)

    // Attempt recovery
    const recovery = await recoverFromError(errorType, walletAddress)
    console.info(`[Cache] Recovery (${recovery.strategy}): ${recovery.message}`)

    if (recovery.success) {
      // Retry the operation once after recovery
      try {
        return await operation()
      } catch (retryError) {
        console.warn('[Cache] Retry after recovery failed:', retryError)
      }
    }

    // Return fallback value
    return fallback
  }
}
```

Usage in cache service:

```typescript
async getVideos(): Promise<Video[]> {
  return withErrorRecovery(
    async () => {
      const cached = await getAllCachedVideos(this.walletAddress)
      return cached.map(cachedVideoToVideo)
    },
    this.walletAddress,
    [] // Fallback: empty array
  )
}
```

## Acceptance Criteria

- [ ] All cache error types are classified correctly
- [ ] Quota exceeded triggers LRU eviction (expired entries first)
- [ ] Corrupted records are detected and removed
- [ ] Full database reset works as last resort
- [ ] Storage eviction is detected and handled
- [ ] Persistent storage is requested on initialization
- [ ] `withErrorRecovery` wrapper retries after successful recovery
- [ ] Data validation catches malformed records
- [ ] All recovery strategies log their actions
- [ ] App continues working after any cache failure

## Testing Notes

- Test quota exceeded with mock (throw `QuotaExceededError`)
- Test corruption with intentionally malformed records
- Test validation with various invalid data shapes
- Test `withErrorRecovery` retry logic
- Test that eviction detection works when DB is missing
- Test persistent storage request in different browser contexts