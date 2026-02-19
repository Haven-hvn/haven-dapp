/**
 * Cache Settings Store (Zustand)
 *
 * Manages user-configurable cache settings including TTL, max cache size,
 * max cached videos, prefetch behavior, and clear-on-disconnect preference.
 *
 * Settings are persisted to localStorage for cross-session consistency.
 *
 * @module stores/cacheSettingsStore
 * @see ../components/settings/CacheManagement.tsx - UI for these settings
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Cache settings state interface
 */
export interface CacheSettingsState {
  // ── Cache Configuration ──────────────────────────────────────────
  /** 
   * Time-to-live for cached videos in days.
   * Videos older than this will be considered stale and may be evicted.
   * @default 7
   */
  ttlDays: number

  /** 
   * Maximum cache size in megabytes.
   * When exceeded, oldest videos will be evicted.
   * @default 5000 (5GB)
   */
  maxCacheSizeMB: number

  /** 
   * Maximum number of videos to cache.
   * @default 50
   */
  maxCachedVideos: number

  /** 
   * Whether background prefetching is enabled.
   * When enabled, videos likely to be watched are cached in advance.
   * @default true
   */
  prefetchEnabled: boolean

  /** 
   * Whether to clear cached videos when wallet disconnects.
   * Security feature for privacy-conscious users.
   * @default false
   */
  clearOnDisconnect: boolean

  // ── Actions ──────────────────────────────────────────────────────
  /** Set cache TTL in days (1-30) */
  setTtlDays: (days: number) => void

  /** Set maximum cache size in MB (500-10000) */
  setMaxCacheSizeMB: (mb: number) => void

  /** Set maximum number of cached videos (5-100) */
  setMaxCachedVideos: (count: number) => void

  /** Enable/disable background prefetching */
  setPrefetchEnabled: (enabled: boolean) => void

  /** Enable/disable clear on disconnect */
  setClearOnDisconnect: (clear: boolean) => void

  /** Reset all settings to defaults */
  resetToDefaults: () => void
}

/**
 * Default cache settings values
 */
const DEFAULTS = {
  ttlDays: 7,
  maxCacheSizeMB: 5000,
  maxCachedVideos: 50,
  prefetchEnabled: true,
  clearOnDisconnect: false,
} as const

/**
 * Cache settings store with persistence
 * 
 * @example
 * ```typescript
 * function CacheSettings() {
 *   const { ttlDays, setTtlDays, prefetchEnabled, setPrefetchEnabled } = useCacheSettings()
 *   
 *   return (
 *     <div>
 *       <select value={ttlDays} onChange={(e) => setTtlDays(Number(e.target.value))}>
 *         <option value={1}>1 day</option>
 *         <option value={7}>7 days</option>
 *         <option value={30}>30 days</option>
 *       </select>
 *       <Toggle checked={prefetchEnabled} onChange={setPrefetchEnabled} />
 *     </div>
 *   )
 * }
 * ```
 */
export const useCacheSettings = create<CacheSettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,

      setTtlDays: (days) => 
        set({ ttlDays: Math.max(1, Math.min(30, days)) }),

      setMaxCacheSizeMB: (mb) => 
        set({ maxCacheSizeMB: Math.max(500, Math.min(10000, mb)) }),

      setMaxCachedVideos: (count) => 
        set({ maxCachedVideos: Math.max(5, Math.min(100, count)) }),

      setPrefetchEnabled: (enabled) => 
        set({ prefetchEnabled: enabled }),

      setClearOnDisconnect: (clear) => 
        set({ clearOnDisconnect: clear }),

      resetToDefaults: () => set(DEFAULTS),
    }),
    {
      name: 'haven-cache-settings',
      // Persist all settings
      partialize: (state) => ({
        ttlDays: state.ttlDays,
        maxCacheSizeMB: state.maxCacheSizeMB,
        maxCachedVideos: state.maxCachedVideos,
        prefetchEnabled: state.prefetchEnabled,
        clearOnDisconnect: state.clearOnDisconnect,
      }),
    }
  )
)

// ── Selector Hooks ─────────────────────────────────────────────────

/**
 * Selector for cache TTL settings
 * Use this in components that only need TTL configuration
 * 
 * @example
 * ```typescript
 * const { ttlDays, setTtlDays } = useCacheTtlSettings()
 * ```
 */
export function useCacheTtlSettings() {
  return useCacheSettings((s) => ({
    ttlDays: s.ttlDays,
    setTtlDays: s.setTtlDays,
  }))
}

/**
 * Selector for cache size limits
 * Use this in components that need size/volume configuration
 * 
 * @example
 * ```typescript
 * const { maxCacheSizeMB, maxCachedVideos } = useCacheSizeSettings()
 * ```
 */
export function useCacheSizeSettings() {
  return useCacheSettings((s) => ({
    maxCacheSizeMB: s.maxCacheSizeMB,
    maxCachedVideos: s.maxCachedVideos,
    setMaxCacheSizeMB: s.setMaxCacheSizeMB,
    setMaxCachedVideos: s.setMaxCachedVideos,
  }))
}

/**
 * Selector for prefetch settings
 * Use this in components that control prefetching behavior
 * 
 * @example
 * ```typescript
 * const { prefetchEnabled, setPrefetchEnabled } = usePrefetchSettings()
 * ```
 */
export function usePrefetchSettings() {
  return useCacheSettings((s) => ({
    prefetchEnabled: s.prefetchEnabled,
    setPrefetchEnabled: s.setPrefetchEnabled,
  }))
}

/**
 * Selector for security settings
 * Use this in components that handle disconnect/security
 * 
 * @example
 * ```typescript
 * const { clearOnDisconnect } = useCacheSecuritySettings()
 * ```
 */
export function useCacheSecuritySettings() {
  return useCacheSettings((s) => ({
    clearOnDisconnect: s.clearOnDisconnect,
    setClearOnDisconnect: s.setClearOnDisconnect,
  }))
}
