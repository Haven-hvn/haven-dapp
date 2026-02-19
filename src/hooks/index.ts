/**
 * Hooks Index
 *
 * Central export point for all React hooks used in the application.
 */

// Video query hooks
export {
  useVideos,
  useVideoQuery,
  useInvalidateVideos,
  videoKeys,
} from './useVideos'
export type {
  UseVideosReturn,
  UseVideoQueryReturn,
  UseInvalidateVideosReturn,
} from './useVideos'

// Cache-aware video hooks
export { useCachedVideos } from './useCachedVideos'
export type { UseCachedVideosReturn } from './useCachedVideos'

// Cache initialization hook
export { useCacheInit } from './useCacheInit'

// Background sync hook
export {
  useBackgroundSync,
  useManualSync,
  useSyncEngineStatus,
} from './useBackgroundSync'
export type {
  UseBackgroundSyncReturn,
  UseManualSyncReturn,
  UseSyncEngineStatusReturn,
} from './useBackgroundSync'

// Expiration status hook
export {
  useExpirationStatus,
  useVideoExpiration,
  useExpirationCounts,
} from './useExpirationStatus'
export type {
  UseExpirationStatusReturn,
} from './useExpirationStatus'

// Service Worker hook
export { useServiceWorker } from './useServiceWorker'
export type { ServiceWorkerState } from './useServiceWorker'

// Video cache hook (cache-first loading)
export { useVideoCache } from './useVideoCache'
export type { UseVideoCacheReturn, LoadingStage } from './useVideoCache'

// Cache status hook (for settings page and library grid)
export {
  useCacheStatus,
  useContentCacheStatus,
  useUnifiedCacheStats,
} from './useCacheStatus'
export type {
  UseCacheStatusReturn,
  UseVideoCacheStatusReturn,
  ContentCacheStats,
  UnifiedCacheStats,
} from './useCacheStatus'

// Security cleanup hook
export { useSecurityCleanup } from './useSecurityCleanup'

// Prefetch hooks
export {
  usePrefetch,
  usePrefetchPolling,
  useVideoPrefetchStatus,
} from './usePrefetch'
export type {
  UsePrefetchReturn,
  UsePrefetchOptions,
} from './usePrefetch'

export {
  useHoverPrefetch,
  useHoverPrefetchHandlers,
  useTouchPrefetch,
} from './useHoverPrefetch'
export type {
  UseHoverPrefetchReturn,
  UseHoverPrefetchOptions,
} from './useHoverPrefetch'
