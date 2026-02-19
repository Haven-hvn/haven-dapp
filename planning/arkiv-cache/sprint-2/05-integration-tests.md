# Task 2.5 — Integration Tests for Cache Data Flow

**Sprint:** 2 — Core Integration  
**Estimate:** 3–4 hours  
**Files:** `src/services/__tests__/videoService.cache.test.ts`, `e2e/cache-integration.spec.ts`

## Objective

Write integration tests that verify the full cache data flow: Arkiv fetch → cache write → cache read → UI display. Ensure the stale-while-revalidate pattern works correctly and that expired entities are properly preserved and displayed.

## Background

Sprint 1 tested the cache layer in isolation. This task tests the integration between the video service, cache service, React Query hooks, and the Zustand store working together as a system.

## Prerequisites

- Tasks 2.1–2.4 completed

## Requirements

### 1. Video Service Integration Tests

Test the modified `videoService.ts` with real cache operations (using `fake-indexeddb`):

```typescript
// src/services/__tests__/videoService.cache.test.ts

import 'fake-indexeddb/auto'
import { fetchAllVideos, fetchVideoByIdWithCache } from '../videoService'
import { getVideoCacheService } from '../cacheService'
import { getAllCachedVideos } from '@/lib/cache'
```

#### Scenarios

**Write-through on successful fetch:**
- [ ] `fetchAllVideos` stores results in IndexedDB
- [ ] After fetch, `getAllCachedVideos` returns the same videos
- [ ] Cached videos have `arkivEntityStatus: 'active'`
- [ ] `lastSyncedAt` is set to approximately `Date.now()`

**Cached expired entities on Arkiv fetch:**
- [ ] Pre-populate cache with 5 videos
- [ ] Mock Arkiv SDK to throw network error
- [ ] `fetchAllVideos` returns the 5 cached videos
- [ ] No error thrown to caller

**Merged results (active + expired):**
- [ ] Pre-populate cache with 3 videos (IDs: A, B, C)
- [ ] Mock Arkiv to return 2 videos (IDs: A, B) — C has expired
- [ ] `fetchAllVideos` returns 3 videos (A, B from Arkiv + C from cache)
- [ ] Video C has `arkivStatus: 'expired'`
- [ ] Videos A and B have fresh Arkiv data

**Single video cache lookup for expired entity:**
- [ ] Pre-populate cache with video X
- [ ] Mock Arkiv `getEntity` to return null (entity expired)
- [ ] `fetchVideoByIdWithCache('X', ownerAddress)` returns cached video X
- [ ] Returned video has `arkivStatus: 'expired'`

**Sync hash change detection:**
- [ ] Cache video with title "Original"
- [ ] Fetch same video from Arkiv with title "Updated"
- [ ] Cache is updated with new title
- [ ] `syncHash` is recalculated

**Empty cache + Arkiv failure:**
- [ ] No cached data
- [ ] Mock Arkiv to throw
- [ ] `fetchAllVideos` throws the Arkiv error (no cached data available)

### 2. Hook Integration Tests

Test React hooks with a test harness (using `@testing-library/react-hooks` or similar):

**`useVideos` with cache:**
- [ ] First render with populated cache → `isLoading: false`, videos from cache
- [ ] After Arkiv fetch completes → videos updated with fresh data
- [ ] `isFetching: true` during background fetch, `isLoading: false`

**`useVideoQuery` with expired entity:**
- [ ] Query for video that exists only in cache
- [ ] Returns cached video data
- [ ] `isLoading: false` after cache read

### 3. Cache Store Integration Tests

**Sync status tracking:**
- [ ] Before sync: `isSyncing: false`
- [ ] During sync: `isSyncing: true`
- [ ] After sync: `isSyncing: false`, `lastSyncedAt` set, `lastSyncResult` populated
- [ ] On sync error: `isSyncing: false`, `lastSyncError` set

**Stats update after sync:**
- [ ] After sync with 3 new videos: `stats.totalVideos === 3`, `stats.activeVideos === 3`
- [ ] After sync where 1 expires: `stats.expiredVideos === 1`

### 4. E2E Smoke Test (Playwright)

Add a basic E2E test that verifies cache behavior in a real browser:

```typescript
// e2e/cache-integration.spec.ts

import { test, expect } from '@playwright/test'

test.describe('Cache Integration', () => {
  test('library loads from cache on second visit', async ({ page }) => {
    // 1. Visit library page (first time — loads from Arkiv)
    await page.goto('/library')
    await page.waitForSelector('[data-testid="video-grid"]')
    
    // 2. Check that videos are displayed
    const videoCount = await page.locator('[data-testid="video-card"]').count()
    expect(videoCount).toBeGreaterThan(0)
    
    // 3. Verify IndexedDB has data
    const cacheCount = await page.evaluate(async () => {
      // Check IndexedDB directly
      const dbs = await indexedDB.databases()
      return dbs.filter(db => db.name?.startsWith('haven-cache-')).length
    })
    expect(cacheCount).toBeGreaterThan(0)
    
    // 4. Reload page
    await page.reload()
    
    // 5. Videos should appear faster (from cache)
    // Measure time to first video card render
    const startTime = Date.now()
    await page.waitForSelector('[data-testid="video-card"]')
    const loadTime = Date.now() - startTime
    
    // Cache load should be fast (< 500ms vs potentially seconds from Arkiv)
    console.log(`Cache load time: ${loadTime}ms`)
  })

  test('expired videos show in library with indicator', async ({ page }) => {
    // This test requires seeding the cache with expired entries
    // Implementation depends on test infrastructure
  })
})
```

### 5. Performance Benchmarks

Add timing measurements to verify cache improves perceived performance:

```typescript
test('cache provides data faster than Arkiv', async () => {
  const walletAddress = '0xtest...'
  
  // Seed cache with 100 videos
  const cacheService = getVideoCacheService(walletAddress)
  const mockVideos = Array.from({ length: 100 }, (_, i) => createMockVideo({ 
    id: `0x${i}`,
    title: `Video ${i}` 
  }))
  await cacheService.cacheVideos(mockVideos)
  
  // Measure cache read time
  const cacheStart = performance.now()
  const cachedVideos = await cacheService.getVideos()
  const cacheTime = performance.now() - cacheStart
  
  expect(cachedVideos).toHaveLength(100)
  expect(cacheTime).toBeLessThan(100) // Should be < 100ms for 100 videos
  
  console.log(`Cache read (100 videos): ${cacheTime.toFixed(2)}ms`)
})
```

## Test Data Setup

Create a shared test setup module:

```typescript
// src/__tests__/cache-test-setup.ts

import 'fake-indexeddb/auto'
import { closeAllCacheDBs } from '@/lib/cache'

beforeEach(() => {
  // Clean state before each test
  closeAllCacheDBs()
})

afterAll(() => {
  closeAllCacheDBs()
})
```

## Acceptance Criteria

- [ ] Write-through caching verified with real IndexedDB operations
- [ ] Cached expired entities returned when merged with Arkiv results
- [ ] Merged results (active + expired) verified
- [ ] Single video cache lookup for expired entities verified
- [ ] Sync hash change detection verified
- [ ] Hook integration tests pass with cache
- [ ] Cache store state transitions verified
- [ ] E2E smoke test passes in at least one browser
- [ ] Performance benchmark shows cache reads < 100ms for 100 videos
- [ ] All tests are deterministic (no flakiness)

## Notes

- E2E tests may need a mock Arkiv server or test environment
- Performance benchmarks are informational, not hard pass/fail criteria
- Consider adding these tests to CI pipeline
- `fake-indexeddb` must be imported before any cache module imports