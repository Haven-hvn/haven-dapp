# Task 2.3 — Cache State Store (Zustand)

**Sprint:** 2 — Core Integration  
**Estimate:** 2–3 hours  
**File:** `src/stores/cacheStore.ts` (new)

## Objective

Create a Zustand store to manage cache-related UI state: sync status, cache health indicators, error tracking, and user preferences for cache behavior. This store bridges the async cache service with reactive UI components.

## Background

The cache service (`cacheService.ts`) is async and stateless — it doesn't track whether a sync is in progress, when the last sync happened, or whether there were errors. The Zustand store provides a reactive layer that UI components can subscribe to for real-time cache status updates.

The project already uses Zustand (see `src/stores/authStore.ts`), so this follows the established pattern.

## Prerequisites

- Task 2.1 (cache-integrated video service)

## Requirements

### 1. Store Interface

```typescript
// src/stores/cacheStore.ts

import { create } from 'zustand'
import type { CacheStats, CacheSyncResult } from '@/types/cache'

interface CacheState {
  // ── Sync Status ──────────────────────────────────────────────────
  /** Whether a sync operation is currently in progress */
  isSyncing: boolean
  /** Timestamp of last successful sync */
  lastSyncedAt: number | null
  /** Result of the last sync operation */
  lastSyncResult: CacheSyncResult | null
  /** Error from the last sync attempt */
  lastSyncError: string | null

  // ── Cache Health ─────────────────────────────────────────────────
  /** Current cache statistics */
  stats: CacheStats | null
  /** Whether the cache is initialized and ready */
  isInitialized: boolean
  /** Whether IndexedDB is available in this browser */
  isAvailable: boolean

  // ── User Preferences ─────────────────────────────────────────────
  /** Whether to show expired videos in the library */
  showExpiredVideos: boolean
  /** Whether to auto-sync on page load */
  autoSyncEnabled: boolean

  // ── Actions ──────────────────────────────────────────────────────
  /** Mark sync as started */
  setSyncing: (syncing: boolean) => void
  /** Record a successful sync */
  setSyncResult: (result: CacheSyncResult) => void
  /** Record a sync error */
  setSyncError: (error: string) => void
  /** Update cache statistics */
  setStats: (stats: CacheStats) => void
  /** Mark cache as initialized */
  setInitialized: (initialized: boolean) => void
  /** Set IndexedDB availability */
  setAvailable: (available: boolean) => void
  /** Toggle showing expired videos */
  toggleShowExpiredVideos: () => void
  /** Toggle auto-sync */
  toggleAutoSync: () => void
  /** Reset all cache state (e.g., on wallet disconnect) */
  reset: () => void
}
```

### 2. Store Implementation

```typescript
const initialState = {
  isSyncing: false,
  lastSyncedAt: null,
  lastSyncResult: null,
  lastSyncError: null,
  stats: null,
  isInitialized: false,
  isAvailable: true, // Assume available until proven otherwise
  showExpiredVideos: true,
  autoSyncEnabled: true,
}

export const useCacheStore = create<CacheState>((set) => ({
  ...initialState,

  setSyncing: (syncing) => set({ isSyncing: syncing }),

  setSyncResult: (result) => set({
    lastSyncResult: result,
    lastSyncedAt: result.syncedAt,
    lastSyncError: result.errors.length > 0 ? result.errors.join('; ') : null,
    isSyncing: false,
  }),

  setSyncError: (error) => set({
    lastSyncError: error,
    isSyncing: false,
  }),

  setStats: (stats) => set({ stats }),

  setInitialized: (initialized) => set({ isInitialized: initialized }),

  setAvailable: (available) => set({ isAvailable: available }),

  toggleShowExpiredVideos: () => set((state) => ({
    showExpiredVideos: !state.showExpiredVideos,
  })),

  toggleAutoSync: () => set((state) => ({
    autoSyncEnabled: !state.autoSyncEnabled,
  })),

  reset: () => set(initialState),
}))
```

### 3. Persist User Preferences

Use `localStorage` to persist user preferences (not IndexedDB — these are simple key-value pairs):

```typescript
import { persist } from 'zustand/middleware'

export const useCacheStore = create<CacheState>()(
  persist(
    (set) => ({
      // ... same as above
    }),
    {
      name: 'haven-cache-preferences',
      // Only persist user preferences, not transient state
      partialize: (state) => ({
        showExpiredVideos: state.showExpiredVideos,
        autoSyncEnabled: state.autoSyncEnabled,
      }),
    }
  )
)
```

### 4. IndexedDB Availability Check

Add a utility to detect IndexedDB support:

```typescript
export function checkIndexedDBAvailability(): boolean {
  try {
    if (typeof window === 'undefined') return false
    if (!window.indexedDB) return false
    
    // Some browsers (e.g., Firefox private mode) have indexedDB
    // but throw when you try to open a database
    // We'll detect this in the DB layer and update the store
    return true
  } catch {
    return false
  }
}
```

### 5. Selector Hooks

Provide convenience selectors for common access patterns:

```typescript
// Selectors for components that only need specific slices
export const useCacheSyncStatus = () => useCacheStore((s) => ({
  isSyncing: s.isSyncing,
  lastSyncedAt: s.lastSyncedAt,
  lastSyncError: s.lastSyncError,
}))

export const useCacheHealth = () => useCacheStore((s) => ({
  isInitialized: s.isInitialized,
  isAvailable: s.isAvailable,
  stats: s.stats,
}))

export const useCachePreferences = () => useCacheStore((s) => ({
  showExpiredVideos: s.showExpiredVideos,
  autoSyncEnabled: s.autoSyncEnabled,
  toggleShowExpiredVideos: s.toggleShowExpiredVideos,
  toggleAutoSync: s.toggleAutoSync,
}))
```

## Integration Points

The store will be updated by:

1. **Video service** — calls `setSyncing(true)` before sync, `setSyncResult()` after
2. **Cache initialization** — calls `setInitialized(true)` and `setAvailable()` on app startup
3. **UI components** — read sync status, toggle preferences
4. **Wallet disconnect handler** — calls `reset()` to clear state

## Acceptance Criteria

- [ ] Zustand store created with all state fields and actions
- [ ] User preferences (`showExpiredVideos`, `autoSyncEnabled`) persisted to localStorage
- [ ] Transient state (sync status, stats) NOT persisted
- [ ] `reset()` clears all state back to initial values
- [ ] Selector hooks provide optimized access to state slices
- [ ] IndexedDB availability check works in SSR context (returns false on server)
- [ ] Store follows existing project patterns (see `authStore.ts`)
- [ ] All types properly imported from `@/types/cache`

## Testing Notes

- Test store actions update state correctly
- Test `reset()` returns to initial state
- Test persistence only saves preferences
- Test selectors return correct slices