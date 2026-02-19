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

// Cache status hook (for settings page)
export {
  useCacheStatus,
  useContentCacheStatus,
  useUnifiedCacheStats,
} from './useCacheStatus'
export type {
  UseCacheStatusReturn,
  ContentCacheStats,
  UnifiedCacheStats,
} from './useCacheStatus'
