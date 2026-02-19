/**
 * Library Utilities
 * 
 * Shared library functions and utilities for Haven Web DApp.
 * 
 * @module lib
 */

// Lit Protocol exports
export {
  initLitClient,
  getLitClient,
  getAuthManager,
  disconnectLitClient,
  isLitConnected,
  getLitNetwork,
  LitError,
  type LitClient,
} from './lit'

export {
  createLitAuthContext,
  createLitAuthContextWithResources,
  isAuthContextExpired,
  getAuthContextAddress,
  LitAuthError,
  type LitAuthContextOptions,
  type LitAuthContext,
} from './lit-auth'

// Lit Session Cache exports
export {
  getCachedAuthContext,
  setCachedAuthContext,
  clearAuthContext,
  isAuthContextValid,
  getSessionInfo,
  hasCachedSession,
  getCachedSessionAddresses,
  restoreSessionsFromStorage,
  EXPIRY_SAFETY_MARGIN_MS,
} from './lit-session-cache'

// AES Key Cache exports
export {
  getCachedKey,
  setCachedKey,
  clearKey,
  clearAllKeys,
  getKeyStats,
  hasCachedKey,
  getCachedKeyCount,
  getVideoIdFromMetadata,
  DEFAULT_KEY_TTL,
  type CachedKeyResult,
  type KeyCacheStats,
} from './aes-key-cache'

export type { Account, Transport, Chain } from 'viem'

// Arkiv exports
export {
  createArkivClient,
  queryEntitiesByOwner,
  getEntity,
  checkArkivConnection,
  getAllEntitiesByOwner,
  parseEntityPayload,
  encodeEntityPayload,
  ArkivError,
  type ArkivEntity,
  type ArkivQueryOptions,
  type ArkivConnectionStatus,
} from './arkiv'

export {
  getArkivClient,
  resetArkivClient,
  hasArkivClient,
} from './arkiv-singleton'

// Formatting utilities
export {
  formatDuration,
  formatFileSize,
  formatDate,
  formatRelativeTime,
} from './format'

// General utilities
export { cn } from './utils'

// Cryptographic utilities
export {
  aesDecrypt,
  aesEncrypt,
  generateAESKey,
  generateIV,
  base64ToUint8Array,
  uint8ArrayToBase64,
  toArrayBuffer,
  toUint8Array,
  hexToUint8Array,
  uint8ArrayToHex,
  secureClear,
  secureCopy,
  sha256,
  sha256Hex,
  readFileAsArrayBuffer,
  readFileAsUint8Array,
  formatBytes,
  checkLargeFileSupport,
} from './crypto'

// Lit Decryption utilities
export {
  decryptAesKey,
  decryptCid,
  batchDecryptAesKeys,
  canDecrypt,
  getDecryptionErrorMessage,
  LitDecryptError,
  type DecryptKeyResult,
  type DecryptProgressCallback,
  type DecryptAesKeyOptions,
  type DecryptCidOptions,
} from './lit-decrypt'

// IPFS utilities
export {
  getIpfsConfig,
  buildIpfsUrl,
  buildIpfsUrls,
  buildIpfsPathUrl,
  normalizeCid,
  isValidCid,
  isGatewayHealthy,
  getHealthyGateways,
  getIpfsErrorMessage,
  IpfsError,
  IPFS_GATEWAYS,
  type IpfsConfig,
} from './ipfs'

// Synapse SDK utilities (Filecoin Onchain Cloud retrieval)
export {
  getSynapseInstance,
  resetSynapseInstance,
  downloadFromSynapse,
  getSynapseErrorMessage,
  SynapseError,
  type SynapseConfig,
} from './synapse'

// Media capabilities utilities
export {
  isMediaCapabilitiesSupported,
  detectCodecSupport,
  canPlayAv1,
  canPlayH264,
  canPlayVp9,
  getBestCodecSync,
  getMediaCapabilities,
  checkCodecSupport,
  formatCodecSupport,
  createCodecConfig,
  type CodecSupport,
  type VideoCodec,
  type MediaCapabilitiesResult,
} from './mediaCapabilities'

// Video Cache API wrapper
export {
  CACHE_NAME,
  VIDEO_URL_PREFIX,
  putVideo,
  getVideo,
  hasVideo,
  hasVideos,
  deleteVideo,
  deleteVideos,
  listCachedVideos,
  getCacheStorageEstimate,
  clearAllVideos,
  getVideoUrl,
  getVideoIdFromUrl,
  extractMetadata,
  getTotalCachedSize,
  evictOldestVideos,
  handleVideoError,
  withRetry,
  type CacheMetadata,
  type CacheEntry,
  type VideoCacheResult,
  type StorageEstimate,
  type PutVideoOptions,
  type RetryCallback,
} from './video-cache'

// Cache Error Logging
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
  type CacheError,
  type CacheErrorCode,
} from './cache-errors'

// Cache Integrity Verification
export {
  verifyCacheEntry,
  verifyMultipleEntries,
  safeGetVideo,
  getCacheHealthMetrics,
  type VerificationResult,
  type BatchVerificationResult,
  type CacheHealthMetrics,
} from './cache-integrity'

// OPFS staging utilities for large encrypted files
export {
  isOpfsAvailable,
  writeToStaging,
  readFromStaging,
  deleteStaging,
  hasStagingFile,
  clearAllStaging,
  getStagingSize,
  listStagedVideos,
  getTotalStagingSize,
  getOpfsErrorMessage,
  OpfsError,
} from './opfs'

// Memory pressure detection & adaptive decryption strategy
export {
  getMemoryInfo,
  getDecryptionStrategy,
  shouldWarnUser,
  isConstrainedDevice,
  getMemorySummary,
  type MemoryInfo,
  type DecryptionStrategy,
  type UserWarning,
} from './memory-detect'

// Buffer lifecycle management for eager garbage collection
export {
  BufferLifecycleManager,
  createBufferLifecycle,
  detachArrayBuffer,
  secureClearBuffer,
  type BufferStats,
} from './buffer-lifecycle'

// Cache TTL & Expiration Strategy
export {
  // Core functions
  isExpired,
  getExpirationTime,
  getTimeUntilExpiration,
  touchVideo,
  getLastAccessed,
  removeFromLRU,
  clearLRUTracking,
  // Cleanup functions
  runCleanupSweep,
  runStoragePressureCleanup,
  runCriticalStorageCleanup,
  enforceMaxVideos,
  // Periodic cleanup
  startPeriodicCleanup,
  stopPeriodicCleanup,
  isPeriodicCleanupRunning,
  // Utilities
  validateTTL,
  getCacheExpirationStats,
  // Constants
  DEFAULT_CONFIG,
  type CacheTTLConfig,
  type CleanupResult,
} from './cache-expiration'

// Security Cleanup Coordinator
export {
  configureCleanup,
  getCleanupOptions,
  resetCleanupOptions,
  onWalletDisconnect,
  onAccountChange,
  onChainChange,
  onSessionExpired,
  onSecurityClear,
  hasCachedAuthData,
  type CleanupOptions,
  type SecurityClearResult,
} from './security-cleanup'

// Video Prefetch Service
export {
  prefetchVideo,
  prefetchVideos,
  prefetchNextVideos,
  cancelPrefetch,
  cancelAllPendingPrefetches,
  isPrefetchQueued,
  getPrefetchStatus,
  getPrefetchQueue,
  getPrefetchStats,
  clearCompletedPrefetches,
  clearAllPrefetches,
  setPrefetchEnabled,
  isPrefetchEnabled,
  setPrefetchWalletAddress,
  getPrefetchWalletAddress,
  shouldPrefetch,
  shouldPrefetchBasedOnConnection,
  shouldPrefetchBasedOnBattery,
  type PrefetchStatus,
  type PrefetchItem,
  type PrefetchQueueStatus,
} from './video-prefetch'

// Storage Persistence Service
export {
  requestPersistentStorage,
  requestPersistentStorageSilent,
  isPersisted,
  getStorageDetails,
  type StorageDetails,
} from './storage-persistence'

// Browser Capabilities Detection
export {
  detectCapabilities,
  buildCacheConfig,
  formatCapabilities,
  isVideoCacheSupported,
  getCapabilitiesWarning,
  type BrowserCapabilities,
  type CacheSystemConfig,
} from './browser-capabilities'

// Performance Benchmarks (Development Only)
export {
  runBenchmarks,
  benchmarkCacheOps,
  benchmarkMemory,
  benchmarkDecryptionPipeline,
  benchmarkPlaybackLatency,
  exportBenchmarkResults,
  downloadBenchmarkResults,
  logBenchmarkResults,
  initBenchmarkConsole,
  type BenchmarkResult,
  type PlaybackLatencyResults,
  type MemoryBenchmarkResults,
  type DecryptionPipelineResults,
  type CacheOperationResults,
  type BenchmarkResults,
  type BenchmarkOptions,
} from './perf-benchmarks'
