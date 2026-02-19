/**
 * Cache State Store (Zustand)
 *
 * Manages cache-related UI state: sync status, cache health indicators,
 * error tracking, and user preferences for cache behavior.
 *
 * This store bridges the async cache service with reactive UI components.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CacheStats, CacheSyncResult } from '../types/cache'

/**
 * Cache state interface
 */
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

/**
 * Initial state for the cache store
 */
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

/**
 * Cache store with persistence for user preferences
 */
export const useCacheStore = create<CacheState>()(
  persist(
    (set) => ({
      ...initialState,

      setSyncing: (syncing) => set({ isSyncing: syncing }),

      setSyncResult: (result) =>
        set({
          lastSyncResult: result,
          lastSyncedAt: result.syncedAt,
          lastSyncError: result.errors.length > 0 ? result.errors.join('; ') : null,
          isSyncing: false,
        }),

      setSyncError: (error) =>
        set({
          lastSyncError: error,
          isSyncing: false,
        }),

      setStats: (stats) => set({ stats }),

      setInitialized: (initialized) => set({ isInitialized: initialized }),

      setAvailable: (available) => set({ isAvailable: available }),

      toggleShowExpiredVideos: () =>
        set((state) => ({
          showExpiredVideos: !state.showExpiredVideos,
        })),

      toggleAutoSync: () =>
        set((state) => ({
          autoSyncEnabled: !state.autoSyncEnabled,
        })),

      reset: () => set(initialState),
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

/**
 * Check if IndexedDB is available in the current environment.
 * Returns false on server-side (SSR context).
 */
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

// ── Selector Hooks ─────────────────────────────────────────────────

/**
 * Selector for sync status
 * Use this in components that only need sync-related state
 */
export function useCacheSyncStatus() {
  return useCacheStore((s) => ({
    isSyncing: s.isSyncing,
    lastSyncedAt: s.lastSyncedAt,
    lastSyncError: s.lastSyncError,
  }))
}

/**
 * Selector for cache health
 * Use this in components that only need health-related state
 */
export function useCacheHealth() {
  return useCacheStore((s) => ({
    isInitialized: s.isInitialized,
    isAvailable: s.isAvailable,
    stats: s.stats,
  }))
}

/**
 * Selector for cache preferences
 * Use this in components that only need preference-related state
 */
export function useCachePreferences() {
  return useCacheStore((s) => ({
    showExpiredVideos: s.showExpiredVideos,
    autoSyncEnabled: s.autoSyncEnabled,
    toggleShowExpiredVideos: s.toggleShowExpiredVideos,
    toggleAutoSync: s.toggleAutoSync,
  }))
}
