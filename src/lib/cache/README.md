# Haven Cache Layer

## Architecture

The cache layer provides persistent local storage for Arkiv entity metadata using IndexedDB. It ensures users never lose their video library data even after Arkiv entities expire on-chain.

## Module Structure

```
src/lib/cache/
├── db.ts              # IndexedDB CRUD operations
├── transforms.ts      # Video ↔ CachedVideo conversions
├── syncEngine.ts      # Background sync engine
├── expirationTracker.ts # Block-based expiration monitoring
├── migrations.ts      # Schema migration registry
├── errorRecovery.ts   # Error classification & recovery
├── exportImport.ts    # JSON export/import
└── index.ts           # Barrel exports

src/services/
├── cacheService.ts    # High-level cache operations
└── videoService.ts    # Modified with cache integration

src/stores/
└── cacheStore.ts      # Zustand store for cache UI state

src/hooks/
├── useCacheInit.ts    # Cache initialization lifecycle
├── useCachedVideos.ts # Cache-aware video hook
├── useBackgroundSync.ts # Background sync hook
└── useExpirationStatus.ts # Expiration tracking hook
```

## Data Flow

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   User      │────▶│  Library     │────▶│ useVideos   │
│   Action    │     │    Page      │     │   Hook      │
└─────────────┘     └──────────────┘     └──────┬──────┘
                                                 │
                    ┌────────────────────────────┘
                    ▼
         ┌─────────────────────┐
         │  React Query Cache  │
         │  (placeholderData)  │
         └──────────┬──────────┘
                    │
         ┌──────────▼──────────┐
         │   Cache Service     │
         │  (cacheService.ts)  │
         └──────────┬──────────┘
                    │
    ┌───────────────┼───────────────┐
    ▼               ▼               ▼
┌────────┐    ┌──────────┐    ┌──────────┐
│IndexedDB│   │  Arkiv   │    │  Merge   │
│  Cache  │   │   SDK    │    │ Results  │
└────────┘    └──────────┘    └──────────┘
```

1. **User opens library** → `useVideos` fires
2. **Cache provides instant data** via `placeholderData`
3. **React Query fetches from Arkiv** in background
4. **`videoService.fetchAllVideos`** syncs results to cache
5. **Merged list** (Arkiv + expired cache) returned to UI
6. **Background sync engine** keeps cache fresh

## Key Concepts

### Write-through

Every successful Arkiv fetch writes to cache automatically. This ensures the cache is always as fresh as the last successful fetch.

```typescript
// In videoService.ts
const arkivVideos = await fetchFromArkiv(ownerAddress)

// Fire-and-forget cache write
cacheService.syncWithArkiv(arkivVideos).catch(err => {
  console.warn('[VideoService] Cache sync failed:', err)
})
```

### Expired Entity Preservation

When an Arkiv entity expires (is removed from the blockchain), the cache preserves its metadata. This allows users to still see and reference videos that are no longer on-chain.

```typescript
// Expired entities are marked with arkivEntityStatus: 'expired'
const expiredVideos = cachedVideos.filter(
  v => v.arkivEntityStatus === 'expired'
)
```

### Merged Results

The library displays both active Arkiv entities and expired cached entities as a unified list.

```typescript
// In cacheService.getMergedVideos()
const videoMap = new Map<string, Video>()

// Add cached expired videos first
for (const cached of allCached) {
  if (cached.arkivEntityStatus === 'expired') {
    videoMap.set(cached.id, cachedVideoToVideo(cached))
  }
}

// Overlay with fresh Arkiv videos (takes precedence)
for (const video of arkivVideos) {
  videoMap.set(video.id, video)
}
```

### Per-Wallet Isolation

Each wallet address gets its own IndexedDB database. This ensures data isolation between users on shared devices.

```typescript
// Database name includes wallet address
const DB_PREFIX = 'haven-cache-'
function getDBName(walletAddress: string): string {
  return `${DB_PREFIX}${walletAddress.toLowerCase()}`
}
```

### Fail-safe

Cache errors never break the app. All cache operations are wrapped in try-catch blocks that gracefully degrade.

```typescript
async getVideos(): Promise<Video[]> {
  try {
    const cached = await getAllCachedVideos(this.walletAddress)
    return cached.map(cachedVideoToVideo)
  } catch (error) {
    // Log but don't throw
    console.warn('[CacheService] Failed to read cache:', error)
    return []
  }
}
```

## Adding a New Field

When adding a new field to the cached video schema:

### 1. Add field to `CachedVideo` type

```typescript
// src/types/cache.ts
export interface CachedVideo {
  // ... existing fields
  
  /** New field description */
  newField: string
}
```

### 2. Bump `CURRENT_CACHE_VERSION`

```typescript
// src/types/cache.ts
export const CURRENT_CACHE_VERSION = 2  // Was 1
```

### 3. Add migration entry

```typescript
// src/lib/cache/migrations.ts
export const migrations: Migration[] = [
  // ... existing migrations
  {
    fromVersion: 1,
    toVersion: 2,
    description: 'Add newField to cached videos',
    data: async (db) => {
      const tx = db.transaction('videos', 'readwrite')
      const store = tx.objectStore('videos')
      const request = store.openCursor()

      await new Promise<void>((resolve, reject) => {
        request.onsuccess = () => {
          const cursor = request.result
          if (cursor) {
            const video = cursor.value as CachedVideo & { newField?: string }
            if (video.cacheVersion < 2) {
              video.newField = 'default value'
              video.cacheVersion = 2
              cursor.update(video)
            }
            cursor.continue()
          } else {
            resolve()
          }
        }
        request.onerror = () => reject(request.error)
      })
    }
  }
]
```

### 4. Update `videoToCachedVideo`

```typescript
// src/lib/cache/transforms.ts
export async function videoToCachedVideo(
  video: Video,
  existingCache?: CachedVideo
): Promise<CachedVideo> {
  return {
    // ... existing fields
    newField: video.newField ?? 'default value',
  }
}
```

### 5. Update `cachedVideoToVideo`

```typescript
// src/lib/cache/transforms.ts
export function cachedVideoToVideo(cached: CachedVideo): Video {
  return {
    // ... existing fields
    newField: cached.newField,
  }
}
```

### 6. Update `isValidCachedVideo`

```typescript
// src/lib/cache/errorRecovery.ts
export function isValidCachedVideo(data: unknown): data is CachedVideo {
  // ... existing checks
  if (typeof video.newField !== 'string') return false
  // ...
}
```

### 7. Run tests

```bash
npm test
```

## Cache Statistics

The cache tracks statistics for monitoring and UI display:

```typescript
export interface CacheStats {
  totalVideos: number      // Total cached videos
  activeVideos: number     // Still on Arkiv
  expiredVideos: number    // Only in cache
  cacheSize: number        // Estimated bytes
  lastFullSync: number | null  // Unix timestamp
  oldestEntry: number | null
  newestEntry: number | null
}
```

Access via:

```typescript
const cacheService = getVideoCacheService(walletAddress)
const stats = await cacheService.getStats()
console.log(`${stats.totalVideos} videos cached`)
```

## Expiration Tracking

The expiration tracker monitors block numbers to provide early warnings:

```typescript
const tracker = getExpirationTracker()
tracker.setCurrentBlock(currentBlock, blockTime)

// Check specific video
const info = tracker.getExpirationInfo(cachedVideo)
if (info?.status === 'expiring-soon') {
  console.warn(`${info.title} expires in ${info.blocksRemaining} blocks`)
}

// Get all expiring soon
const expiring = tracker.getExpiringSoon(cachedVideos)
```

## Error Recovery

The cache layer includes automatic error recovery:

```typescript
// Classify errors for targeted recovery
const errorType = classifyCacheError(error)
// → 'QUOTA_EXCEEDED' | 'DB_BLOCKED' | 'DB_CORRUPTED' | etc.

// Attempt automatic recovery
const result = await recoverFromError(errorType, walletAddress)
// → { success: true, strategy: 'evict-lru', message: '...' }
```

## Export/Import

Users can export their cache for backup or migration:

```typescript
// Export
const exportData = await exportCacheData(walletAddress)
downloadExport(exportData)  // Triggers file download

// Import
const result = await importCacheData(file, walletAddress)
if (result.success) {
  console.log(`Imported ${result.imported} videos`)
}
```

## Testing

### Unit Tests

```bash
npm test -- src/lib/cache/__tests__
```

### E2E Tests

```bash
npx playwright test e2e/cache-*.spec.ts
```

### Test Helpers

```typescript
import { seedCache, createTestCachedVideo } from '../helpers/cache-helpers'

// Seed cache with test data
const video = createTestCachedVideo({ title: 'Test' })
await seedCache(page, walletAddress, [video])

// Verify cache state
const cached = await readCache(page, walletAddress)
expect(cached).toHaveLength(1)
```

## Performance Considerations

1. **IndexedDB is async** — Always await cache operations
2. **Batch writes** — Use `putCachedVideos()` for multiple videos
3. **Lazy loading** — Cache is only opened when needed
4. **Connection pooling** — Reuses database connections per wallet
5. **LRU eviction** — Automatically removes old entries when quota exceeded

## Browser Compatibility

- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support (including persistent storage)
- Private browsing: Graceful degradation (cache unavailable)

## Security

- No private keys stored in cache
- Per-wallet database isolation
- Content Security Policy compatible
- No executable code in exports
