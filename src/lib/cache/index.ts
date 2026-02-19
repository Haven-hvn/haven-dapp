/**
 * Cache Module
 * 
 * Local in-browser cache for Arkiv entities using IndexedDB.
 * Provides utilities for video metadata persistence and sync.
 */

// Transform utilities
export {
  videoToCachedVideo,
  cachedVideoToVideo,
  computeSyncHash,
  hasVideoChanged,
  markAsExpired,
  updateLastAccessed,
  updateVideoCacheStatus,
  createInitialCachedVideo,
  ensureLatestVersion,
} from './transforms'

// Database operations
export {
  getAllCachedVideos,
  getCachedVideo,
  putCachedVideo,
  putCachedVideos,
  deleteCachedVideo,
  deleteCachedVideos,
  clearCachedVideos,
  getCacheMetadata,
  setCacheMetadata,
  getAllCacheMetadata,
  getVideosByLastAccessed,
  getCacheStats,
  deleteDatabase,
  getCacheDB,
  closeCacheDB,
  closeAllCacheDBs,
} from './db'

// Sync engine
export {
  CacheSyncEngine,
  getSyncEngine,
  stopAllSyncEngines,
  hasSyncEngine,
} from './syncEngine'

// Migration system
export {
  runMigrations,
  runStructuralMigrations,
  getStoredSchemaVersion,
  getFailedMigration,
  migrations,
  ensureLatestVersion as ensureVideoAtLatestVersion,
} from './migrations'
export type { Migration } from './migrations'

// Expiration tracker
export {
  ExpirationTracker,
  getExpirationTracker,
  resetExpirationTracker,
  hasExpirationTracker,
  refreshExpiringSoon,
  markExpiredVideos,
  EXPIRATION_THRESHOLDS,
} from './expirationTracker'
export type {
  ExpirationInfo,
  ExpirationStatus,
  BlockTiming,
} from './expirationTracker'

// Error recovery & resilience
export {
  classifyCacheError,
  recoverFromError,
  isValidCachedVideo,
  requestPersistentStorage,
  getStorageEstimate,
  withErrorRecovery,
  initCacheResilience,
} from './errorRecovery'

// Cache error logging
export {
  logCacheError,
  getCacheErrors,
  getRecentCacheErrors,
  clearCacheErrors,
  getCacheErrorCounts,
  hasCacheError,
  isQuotaExceededError,
  isCorruptionError,
  classifyCacheApiError,
} from '../cache-errors'
export type { CacheError, CacheErrorCode } from '../cache-errors'

// Cache integrity verification
export {
  verifyCacheEntry,
  verifyMultipleEntries,
  safeGetVideo,
  getCacheHealthMetrics,
} from '../cache-integrity'
export type {
  VerificationResult,
  BatchVerificationResult,
  CacheHealthMetrics,
} from '../cache-integrity'

// Export & Import
export {
  exportCacheData,
  downloadExport,
  importCacheData,
  validateExportData,
  computeChecksum,
} from './exportImport'
export type {
  CacheExportData,
  ImportResult,
  ImportOptions,
} from './exportImport'

// Type exports (re-export for convenience)
export type {
  CachedVideo,
  CacheDBSchema,
  CacheMetadataEntry,
  CacheConfig,
  CacheStats,
  CacheSyncResult,
  RecoveryResult,
  CacheErrorType,
} from '../../types/cache'

export {
  CURRENT_CACHE_VERSION,
  DEFAULT_CACHE_CONFIG,
} from '../../types/cache'

export type {
  Video,
  CodecVariant,
  LitEncryptionMetadata,
  SegmentMetadata,
} from '../../types/video'
