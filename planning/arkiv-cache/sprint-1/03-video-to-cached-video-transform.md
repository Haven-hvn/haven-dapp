# Task 1.3 — Video ↔ CachedVideo Transform Utilities

**Sprint:** 1 — Foundation  
**Estimate:** 2–3 hours  
**File:** `src/lib/cache/transforms.ts`

## Objective

Create utility functions to convert between the application `Video` type and the `CachedVideo` type used for IndexedDB storage. Handle serialization concerns (e.g., `Date` → timestamp conversion) and compute sync hashes for change detection.

## Background

The `Video` type uses `Date` objects for `createdAt` and `updatedAt`, but IndexedDB works best with plain serializable values. The `CachedVideo` type uses Unix timestamps (numbers) for all date fields. We need clean, tested transform functions that handle this conversion without data loss.

Additionally, we need a hashing function to compute a `syncHash` — a fingerprint of the video's data content — so we can efficiently detect whether an Arkiv entity has changed since the last sync without doing a deep comparison.

## Prerequisites

- Task 1.1 (cache types) must be completed

## Requirements

### 1. `videoToCachedVideo` Transform

Convert a `Video` (from Arkiv) into a `CachedVideo` (for IndexedDB):

```typescript
export function videoToCachedVideo(
  video: Video,
  existingCache?: CachedVideo
): CachedVideo {
  const now = Date.now()
  
  return {
    // Spread all Video fields
    ...video,
    
    // Convert Date objects to timestamps for IndexedDB
    createdAt: video.createdAt.getTime(),
    updatedAt: video.updatedAt?.getTime(),
    
    // Cache metadata
    cachedAt: existingCache?.cachedAt ?? now,
    lastSyncedAt: now,
    lastAccessedAt: existingCache?.lastAccessedAt ?? now,
    cacheVersion: CURRENT_CACHE_VERSION,
    
    // Arkiv status
    arkivEntityStatus: 'active',
    arkivEntityKey: video.id,
    
    // Sync metadata
    syncHash: computeSyncHash(video),
    isDirty: false,
  }
}
```

**Key behaviors:**
- Preserves `cachedAt` from existing cache entry if updating (don't overwrite first-cached timestamp)
- Always updates `lastSyncedAt` to current time
- Sets `arkivEntityStatus` to `'active'` since we just fetched it from Arkiv
- Computes fresh `syncHash`

### 2. `cachedVideoToVideo` Transform

Convert a `CachedVideo` (from IndexedDB) back to a `Video` (for UI):

```typescript
export function cachedVideoToVideo(cached: CachedVideo): Video {
  return {
    // Spread relevant Video fields (exclude cache metadata)
    id: cached.id,
    owner: cached.owner,
    title: cached.title,
    description: cached.description,
    duration: cached.duration,
    // ... all other Video fields ...
    
    // Convert timestamps back to Date objects
    createdAt: new Date(cached.createdAt),
    updatedAt: cached.updatedAt ? new Date(cached.updatedAt) : undefined,
    
    // Segment metadata dates
    segmentMetadata: cached.segmentMetadata ? {
      ...cached.segmentMetadata,
      startTimestamp: new Date(cached.segmentMetadata.startTimestamp),
      endTimestamp: cached.segmentMetadata.endTimestamp 
        ? new Date(cached.segmentMetadata.endTimestamp) 
        : undefined,
    } : undefined,
  }
}
```

**Key behaviors:**
- Strips all cache-specific fields (`cachedAt`, `lastSyncedAt`, `arkivEntityStatus`, etc.)
- Converts timestamps back to `Date` objects
- Returns a clean `Video` type that existing UI components can consume without changes

### 3. `computeSyncHash` Function

Generate a deterministic hash of video data for change detection:

```typescript
export async function computeSyncHash(video: Video): Promise<string> {
  // Create a deterministic string from the video's content fields
  // Exclude UI-only fields (isLoading, error) and volatile fields
  const hashInput = JSON.stringify({
    id: video.id,
    owner: video.owner,
    title: video.title,
    description: video.description,
    duration: video.duration,
    filecoinCid: video.filecoinCid,
    encryptedCid: video.encryptedCid,
    isEncrypted: video.isEncrypted,
    hasAiData: video.hasAiData,
    vlmJsonCid: video.vlmJsonCid,
    mintId: video.mintId,
    sourceUri: video.sourceUri,
    creatorHandle: video.creatorHandle,
    codecVariants: video.codecVariants,
  })
  
  // Use Web Crypto API for hashing (available in all modern browsers)
  const encoder = new TextEncoder()
  const data = encoder.encode(hashInput)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}
```

### 4. `hasVideoChanged` Helper

Quick check if a video needs updating in cache:

```typescript
export async function hasVideoChanged(
  video: Video, 
  cached: CachedVideo
): Promise<boolean> {
  const newHash = await computeSyncHash(video)
  return newHash !== cached.syncHash
}
```

### 5. `markAsExpired` Helper

Mark a cached video as expired (entity no longer on Arkiv):

```typescript
export function markAsExpired(cached: CachedVideo): CachedVideo {
  return {
    ...cached,
    arkivEntityStatus: 'expired',
    lastSyncedAt: Date.now(),
  }
}
```

### 6. `updateLastAccessed` Helper

Update the access timestamp (for LRU eviction):

```typescript
export function updateLastAccessed(cached: CachedVideo): CachedVideo {
  return {
    ...cached,
    lastAccessedAt: Date.now(),
  }
}
```

## Serialization Concerns

The `Video` type contains fields that need special handling for IndexedDB:

| Field | `Video` Type | `CachedVideo` Type | Transform |
|-------|-------------|-------------------|-----------|
| `createdAt` | `Date` | `number` | `.getTime()` / `new Date()` |
| `updatedAt` | `Date \| undefined` | `number \| undefined` | `.getTime()` / `new Date()` |
| `segmentMetadata.startTimestamp` | `Date` | `number` | `.getTime()` / `new Date()` |
| `segmentMetadata.endTimestamp` | `Date \| undefined` | `number \| undefined` | `.getTime()` / `new Date()` |
| `litEncryptionMetadata` | object | object | No transform (serializable) |
| `codecVariants` | array | array | No transform (serializable) |

## Acceptance Criteria

- [ ] `videoToCachedVideo` correctly converts all fields including dates
- [ ] `cachedVideoToVideo` produces a valid `Video` that passes type checking
- [ ] `computeSyncHash` produces deterministic output (same input → same hash)
- [ ] `computeSyncHash` ignores UI-only fields (`isLoading`, `error`)
- [ ] `hasVideoChanged` correctly detects changes
- [ ] `markAsExpired` preserves all data while updating status
- [ ] Round-trip test: `Video` → `CachedVideo` → `Video` produces equivalent data
- [ ] All functions are pure (no side effects except `computeSyncHash` using crypto)
- [ ] Exported from `src/lib/cache/index.ts`

## Testing Notes

- Test round-trip conversion with various video configurations (encrypted, unencrypted, with segments, with codec variants)
- Test `computeSyncHash` determinism with identical inputs
- Test that changing any content field produces a different hash
- Test edge cases: undefined optional fields, empty strings, zero duration