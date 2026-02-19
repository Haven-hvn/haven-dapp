# Task 1.5 — Unit Tests for Foundation Layer

**Sprint:** 1 — Foundation  
**Estimate:** 3–4 hours  
**Files:** `src/lib/cache/__tests__/db.test.ts`, `src/lib/cache/__tests__/transforms.test.ts`, `src/services/__tests__/cacheService.test.ts`

## Objective

Write comprehensive unit tests for the cache foundation layer: IndexedDB operations, transform utilities, and the cache service. Ensure correctness, edge case handling, and error resilience before integrating with the rest of the application.

## Background

The cache layer is critical infrastructure — bugs here could cause data loss (the exact problem we're trying to solve). Thorough testing at this stage prevents regressions and gives confidence for the integration work in Sprint 2.

## Prerequisites

- Tasks 1.1–1.4 completed
- Install dev dependency: `npm install -D fake-indexeddb`

## Requirements

### 1. Transform Tests (`transforms.test.ts`)

#### `videoToCachedVideo`
- [ ] Converts `Date` fields to Unix timestamps
- [ ] Sets `cachedAt` to current time for new entries
- [ ] Preserves `cachedAt` from existing cache entry on update
- [ ] Sets `arkivEntityStatus` to `'active'`
- [ ] Sets `isDirty` to `false`
- [ ] Handles video with all optional fields populated
- [ ] Handles video with minimal fields (only required)
- [ ] Handles video with segment metadata (nested Date conversion)
- [ ] Handles video with codec variants array

#### `cachedVideoToVideo`
- [ ] Converts Unix timestamps back to `Date` objects
- [ ] Strips all cache-specific fields
- [ ] Result passes TypeScript `Video` type check
- [ ] Handles cached video with `arkivEntityStatus: 'expired'`
- [ ] Handles nested segment metadata date conversion

#### Round-trip Tests
- [ ] `Video` → `CachedVideo` → `Video` produces equivalent data
- [ ] Round-trip preserves all optional fields when present
- [ ] Round-trip handles `undefined` optional fields correctly

#### `computeSyncHash`
- [ ] Same video produces same hash (deterministic)
- [ ] Different title produces different hash
- [ ] Different CID produces different hash
- [ ] Ignores `isLoading` field changes
- [ ] Ignores `error` field changes
- [ ] Handles undefined optional fields consistently

#### `hasVideoChanged`
- [ ] Returns `false` for identical video and cache
- [ ] Returns `true` when title changes
- [ ] Returns `true` when CID changes
- [ ] Returns `true` when encryption status changes

#### `markAsExpired`
- [ ] Sets `arkivEntityStatus` to `'expired'`
- [ ] Updates `lastSyncedAt`
- [ ] Preserves all other fields

### 2. IndexedDB Tests (`db.test.ts`)

Use `fake-indexeddb` to simulate IndexedDB in Node.js:

```typescript
import 'fake-indexeddb/auto'
```

#### Database Lifecycle
- [ ] `getCacheDB` creates database on first call
- [ ] `getCacheDB` returns same instance on subsequent calls (connection pooling)
- [ ] `closeCacheDB` closes connection and removes from pool
- [ ] `closeAllCacheDBs` closes all open connections
- [ ] Database is namespaced by wallet address (different addresses → different DBs)

#### CRUD Operations
- [ ] `putCachedVideo` stores a video and `getCachedVideo` retrieves it
- [ ] `getCachedVideo` returns `undefined` for non-existent ID
- [ ] `deleteCachedVideo` removes a video
- [ ] `deleteCachedVideo` is no-op for non-existent ID
- [ ] `getAllCachedVideos` returns all stored videos
- [ ] `getAllCachedVideos` returns empty array for empty database
- [ ] `getCachedVideosByStatus` filters correctly by status

#### Bulk Operations
- [ ] `putCachedVideos` stores multiple videos atomically
- [ ] `putCachedVideos` with empty array is no-op
- [ ] `putCachedVideos` overwrites existing entries (upsert behavior)

#### Metadata Operations
- [ ] `setCacheMetadata` stores and `getCacheMetadata` retrieves
- [ ] `getCacheMetadata` returns `undefined` for non-existent key

#### Maintenance
- [ ] `clearCache` removes all videos but preserves metadata
- [ ] `deleteDatabase` removes entire database
- [ ] `getCacheCount` returns correct count

### 3. Cache Service Tests (`cacheService.test.ts`)

Mock the `db.ts` module to test service logic in isolation:

#### `syncWithArkiv`
- [ ] Empty cache + 3 Arkiv videos → adds 3, result: `{ added: 3, updated: 0, expired: 0, unchanged: 0 }`
- [ ] 3 cached + same 3 Arkiv (unchanged) → result: `{ added: 0, updated: 0, expired: 0, unchanged: 3 }`
- [ ] 3 cached + 2 Arkiv (1 removed) → marks 1 expired: `{ added: 0, updated: 0, expired: 1, unchanged: 2 }`
- [ ] 3 cached + 4 Arkiv (1 new) → adds 1: `{ added: 1, updated: 0, expired: 0, unchanged: 3 }`
- [ ] 3 cached + 3 Arkiv (1 changed title) → updates 1: `{ added: 0, updated: 1, expired: 0, unchanged: 2 }`
- [ ] Already-expired entries are NOT re-expired when missing from Arkiv
- [ ] Updates `lastSyncTime` metadata after sync

#### `getMergedVideos`
- [ ] Returns Arkiv videos + expired cached videos
- [ ] Arkiv data takes precedence over cache for active entities
- [ ] Expired videos appear in the list with correct data
- [ ] Result is sorted by `createdAt` descending

#### Error Resilience
- [ ] `getVideos` returns empty array when IndexedDB fails
- [ ] `cacheVideo` logs warning but doesn't throw when IndexedDB fails
- [ ] `syncWithArkiv` returns partial results when some operations fail
- [ ] Service continues working after transient IndexedDB error

#### Singleton Management
- [ ] `getVideoCacheService` returns same instance for same address
- [ ] `getVideoCacheService` returns different instance for different address
- [ ] Address comparison is case-insensitive

## Test Utilities

Create shared test fixtures in `src/lib/cache/__tests__/fixtures.ts`:

```typescript
export function createMockVideo(overrides?: Partial<Video>): Video {
  return {
    id: '0x' + Math.random().toString(16).slice(2),
    owner: '0xabcdef1234567890abcdef1234567890abcdef12',
    title: 'Test Video',
    duration: 120,
    isEncrypted: false,
    hasAiData: false,
    createdAt: new Date('2024-06-15T10:00:00Z'),
    ...overrides,
  }
}

export function createMockCachedVideo(overrides?: Partial<CachedVideo>): CachedVideo {
  return {
    ...createMockVideo(),
    cachedAt: Date.now(),
    lastSyncedAt: Date.now(),
    lastAccessedAt: Date.now(),
    cacheVersion: 1,
    arkivEntityStatus: 'active',
    arkivEntityKey: '0xtest',
    isDirty: false,
    createdAt: new Date('2024-06-15T10:00:00Z').getTime(),
    ...overrides,
  }
}
```

## Acceptance Criteria

- [ ] All tests pass with `fake-indexeddb`
- [ ] Test coverage > 90% for `db.ts`, `transforms.ts`, and `cacheService.ts`
- [ ] No flaky tests (deterministic, no timing dependencies)
- [ ] Tests run in < 5 seconds total
- [ ] Test fixtures are reusable across test files
- [ ] Error scenarios are explicitly tested

## Notes

- Consider using Vitest or Jest for unit tests (check project's existing test setup — currently uses Playwright for E2E, may need a unit test runner)
- If adding a unit test runner, keep it minimal — Vitest is recommended for Next.js projects
- `fake-indexeddb/auto` polyfills the global `indexedDB` object automatically