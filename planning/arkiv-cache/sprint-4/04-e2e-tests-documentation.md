# Task 4.4 — End-to-End Tests & Documentation

**Sprint:** 4 — UX & Polish  
**Estimate:** 4–5 hours  
**Files:** `e2e/cache-*.spec.ts`, `src/lib/cache/README.md`, various JSDoc updates

## Objective

Write comprehensive end-to-end tests for the full cache feature using Playwright, and create developer documentation for the cache architecture. Ensure the feature is well-tested in real browser environments and that future developers can understand and maintain the cache layer.

## Background

Unit and integration tests (Sprints 1–3) verify individual components work correctly. E2E tests verify the entire feature works from the user's perspective in a real browser. Documentation ensures the cache architecture is maintainable long-term.

## Prerequisites

- All Sprint 1–3 tasks completed
- Tasks 4.1–4.3 completed

## Requirements

### 1. E2E Test Suite

```typescript
// e2e/cache-library.spec.ts

import { test, expect } from '@playwright/test'

test.describe('Cache: Library Experience', () => {
  
  test('first visit loads from Arkiv and populates cache', async ({ page }) => {
    // 1. Connect wallet
    // 2. Navigate to library
    // 3. Wait for videos to load
    // 4. Verify IndexedDB has been populated
    // 5. Verify video cards are displayed
  })

  test('second visit shows cached data immediately', async ({ page }) => {
    // 1. Connect wallet, load library (populates cache)
    // 2. Navigate away
    // 3. Navigate back to library
    // 4. Verify videos appear without loading spinner
    // 5. Verify background sync happens
  })

  test('library works when Arkiv is unreachable', async ({ page }) => {
    // 1. Connect wallet, load library (populates cache)
    // 2. Block Arkiv network requests
    // 3. Reload page
    // 4. Verify cached videos still display
    // 5. Verify appropriate offline/cache indicator
  })

  test('expired videos show with correct indicators', async ({ page }) => {
    // 1. Seed IndexedDB with expired video entries
    // 2. Connect wallet, load library
    // 3. Verify expired badge/indicator is visible
    // 4. Verify "Preserved in local cache" text
  })

  test('filter toggle hides/shows expired videos', async ({ page }) => {
    // 1. Load library with mix of active and expired
    // 2. Count total video cards
    // 3. Toggle "Show expired videos" off
    // 4. Verify expired videos are hidden
    // 5. Toggle back on
    // 6. Verify expired videos reappear
  })
})
```

### 2. E2E: Settings & Cache Management

```typescript
// e2e/cache-settings.spec.ts

test.describe('Cache: Settings Management', () => {

  test('cache statistics display correctly', async ({ page }) => {
    // 1. Populate cache with known data
    // 2. Navigate to settings
    // 3. Verify total count matches
    // 4. Verify active/expired counts
    // 5. Verify storage usage is shown
  })

  test('manual sync updates cache', async ({ page }) => {
    // 1. Navigate to settings
    // 2. Click "Sync Now"
    // 3. Verify loading state
    // 4. Verify sync result is displayed
    // 5. Verify stats update
  })

  test('clear cache removes all data', async ({ page }) => {
    // 1. Populate cache
    // 2. Navigate to settings
    // 3. Click "Clear Cache"
    // 4. Confirm in dialog
    // 5. Verify cache is empty
    // 6. Verify stats show 0
  })

  test('export produces downloadable JSON file', async ({ page }) => {
    // 1. Populate cache with test data
    // 2. Navigate to settings
    // 3. Click "Export Library"
    // 4. Verify file download
    // 5. Read downloaded file
    // 6. Verify JSON structure and video count
  })

  test('import restores cache from file', async ({ page }) => {
    // 1. Clear cache
    // 2. Navigate to settings
    // 3. Upload previously exported JSON
    // 4. Verify import success message
    // 5. Navigate to library
    // 6. Verify imported videos appear
  })

  test('import rejects wrong wallet address', async ({ page }) => {
    // 1. Create export for wallet A
    // 2. Connect as wallet B
    // 3. Try to import
    // 4. Verify error message about wallet mismatch
  })
})
```

### 3. E2E: Watch Page with Cache

```typescript
// e2e/cache-watch.spec.ts

test.describe('Cache: Watch Page', () => {

  test('expired video detail page shows cache indicator', async ({ page }) => {
    // 1. Seed cache with expired video
    // 2. Navigate to /watch/{id}
    // 3. Verify amber banner about cached metadata
    // 4. Verify video player still works (content on Filecoin via Synapse SDK)
  })

  test('expiring-soon video shows warning', async ({ page }) => {
    // 1. Seed cache with expiring-soon video
    // 2. Navigate to /watch/{id}
    // 3. Verify orange warning about upcoming expiration
  })
})
```

### 4. E2E Test Utilities

Create helpers for cache-related E2E tests:

```typescript
// e2e/helpers/cache-helpers.ts

import { Page } from '@playwright/test'

/** Seed IndexedDB with test cache data */
export async function seedCache(page: Page, walletAddress: string, videos: any[]) {
  await page.evaluate(async ({ address, videos }) => {
    // Open IndexedDB and write test data directly
    const dbName = `haven-cache-${address.toLowerCase()}`
    const request = indexedDB.open(dbName, 1)
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains('videos')) {
        const store = db.createObjectStore('videos', { keyPath: 'id' })
        store.createIndex('by-owner', 'owner')
        store.createIndex('by-cached-at', 'cachedAt')
        store.createIndex('by-last-synced', 'lastSyncedAt')
        store.createIndex('by-status', 'arkivEntityStatus')
      }
      if (!db.objectStoreNames.contains('metadata')) {
        db.createObjectStore('metadata', { keyPath: 'key' })
      }
    }

    return new Promise<void>((resolve, reject) => {
      request.onsuccess = () => {
        const db = request.result
        const tx = db.transaction('videos', 'readwrite')
        for (const video of videos) {
          tx.objectStore('videos').put(video)
        }
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      }
      request.onerror = () => reject(request.error)
    })
  }, { address: walletAddress, videos })
}

/** Read all cached videos from IndexedDB */
export async function readCache(page: Page, walletAddress: string): Promise<any[]> {
  return page.evaluate(async (address) => {
    const dbName = `haven-cache-${address.toLowerCase()}`
    return new Promise<any[]>((resolve, reject) => {
      const request = indexedDB.open(dbName)
      request.onsuccess = () => {
        const db = request.result
        if (!db.objectStoreNames.contains('videos')) {
          resolve([])
          return
        }
        const tx = db.transaction('videos', 'readonly')
        const getAll = tx.objectStore('videos').getAll()
        getAll.onsuccess = () => resolve(getAll.result)
        getAll.onerror = () => reject(getAll.error)
      }
      request.onerror = () => reject(request.error)
    })
  }, walletAddress)
}

/** Clear all cache databases */
export async function clearAllCaches(page: Page) {
  await page.evaluate(async () => {
    const dbs = await indexedDB.databases()
    for (const db of dbs) {
      if (db.name?.startsWith('haven-cache-')) {
        indexedDB.deleteDatabase(db.name)
      }
    }
  })
}

/** Create a mock cached video for testing */
export function createTestCachedVideo(overrides: Record<string, any> = {}) {
  return {
    id: '0x' + Math.random().toString(16).slice(2, 18),
    owner: '0xabcdef1234567890abcdef1234567890abcdef12',
    title: 'Test Video',
    duration: 120,
    isEncrypted: false,
    hasAiData: false,
    createdAt: Date.now() - 86400000,
    cachedAt: Date.now() - 3600000,
    lastSyncedAt: Date.now() - 3600000,
    lastAccessedAt: Date.now() - 1800000,
    cacheVersion: 1,
    arkivEntityStatus: 'active',
    arkivEntityKey: '0xtest',
    isDirty: false,
    ...overrides,
  }
}
```

### 5. Developer Documentation

```markdown
// src/lib/cache/README.md

# Haven Cache Layer

## Architecture

The cache layer provides persistent local storage for Arkiv entity metadata
using IndexedDB. It ensures users never lose their video library data even
after Arkiv entities expire on-chain.

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

1. User opens library → `useVideos` fires
2. Cache provides instant data via `placeholderData`
3. React Query fetches from Arkiv in background
4. `videoService.fetchAllVideos` syncs results to cache
5. Merged list (Arkiv + expired cache) returned to UI
6. Background sync engine keeps cache fresh

## Key Concepts

- **Write-through**: Every Arkiv fetch writes to cache
- **Expired entity preservation**: Cache preserves metadata for entities Arkiv has removed
- **Merged results**: Active Arkiv + expired cache = complete library
- **Per-wallet isolation**: Each wallet has its own IndexedDB database
- **Fail-safe**: Cache errors never break the app

## Adding a New Field

1. Add field to `CachedVideo` in `src/types/cache.ts`
2. Bump `CURRENT_CACHE_VERSION` in `migrations.ts`
3. Add migration entry to `migrations` array
4. Update `videoToCachedVideo` in `transforms.ts`
5. Update `cachedVideoToVideo` in `transforms.ts`
6. Update `isValidCachedVideo` in `errorRecovery.ts`
7. Run tests
```

### 6. Inline Documentation Audit

Review and update JSDoc comments across all cache-related files:

- [ ] `src/types/cache.ts` — All interfaces documented
- [ ] `src/lib/cache/db.ts` — All functions documented with `@param`, `@returns`, `@example`
- [ ] `src/lib/cache/transforms.ts` — Transform functions documented
- [ ] `src/services/cacheService.ts` — All public methods documented
- [ ] `src/stores/cacheStore.ts` — Store interface documented
- [ ] `src/hooks/useCacheInit.ts` — Hook purpose and usage documented
- [ ] `src/hooks/useCachedVideos.ts` — Hook return type documented
- [ ] `src/hooks/useBackgroundSync.ts` — Hook behavior documented

## Acceptance Criteria

- [ ] E2E tests cover: library load, expired entity display, cache indicators, settings, export/import
- [ ] E2E test helpers are reusable and well-documented
- [ ] All E2E tests pass in Chromium (primary target)
- [ ] E2E tests pass in Firefox and WebKit (secondary targets)
- [ ] `src/lib/cache/README.md` provides complete architecture overview
- [ ] All public functions have JSDoc with `@param`, `@returns`, `@example`
- [ ] "Adding a New Field" guide is accurate and complete
- [ ] Data flow diagram matches actual implementation
- [ ] No undocumented public exports in cache modules

## Testing Notes

- E2E tests should use the existing Playwright configuration
- Tests that require wallet connection may need the Web3 test project
- Use `seedCache` helper to set up test data without going through Arkiv
- Consider test parallelization — each test should use a unique wallet address
- Network interception (`page.route`) can simulate Arkiv failures