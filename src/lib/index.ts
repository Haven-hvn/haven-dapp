/**
 * Library Utilities
 * 
 * Shared library functions and utilities for Haven Web DApp.
 * 
 * @module lib
 */

// Haven-AOL exports (ICP VetKD decryption)
export {
  getHavenAolConfig,
  isHavenAolConfigValid,
  createSignedGateRequest,
  retryWithBumpedNonce,
  decryptContentKey,
  decryptCidWithHavenAol,
  GATE_METADATA_VERSION,
  normalizeChain,
  isGateMetadata,
  resolveDerivationCid,
  parseGateMetadata,
  parseEncryptionMetadata,
  parseCidEncryptionMetadata,
  normalizeDerivationThreshold,
  normalizeGateMetadataForDerivation,
  HavenAolDecryptError,
  mapGateError,
  getHavenAolErrorMessage,
  isRetryableError,
  getNextNonce,
  bumpNonce,
  clearNonce,
  getCurrentNonce,
  type HavenAolConfig,
  type SignedGateRequest,
  type WalletClientLike,
  type DecryptContentKeyOptions,
  type DecryptContentKeyResult,
  type DecryptCidOptions,
  type GateMetadataJson,
  type HavenAolErrorCode,
} from './haven-aol'

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
  getLatestEntityByOwner,
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


// CID normalization and retrieval errors (bytes via Synapse)
export {
  normalizeCid,
  getIpfsErrorMessage,
  IpfsError,
} from './ipfs'

// Synapse SDK utilities (Filecoin Onchain Cloud retrieval)
export {
  getSynapseInstance,
  resetSynapseInstance,
  downloadFromSynapse,
  getSynapseErrorMessage,
  SynapseError,
  type SynapseConfig,
  type SynapseDownloadOptions,
} from './synapse'

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

// Chunked File Decryption (haven-cli streaming format)
export {
  decryptChunkedStream,
  decryptChunkedFile,
  decryptChunkedToCache,
  decryptChunkedProgressive,
  deriveChunkIv,
  parseChunkedFileHeader,
  concatenateChunks,
  isChunkedFormat,
  estimateChunks,
  type ChunkedDecryptProgress,
  type ChunkedDecryptOptions,
  type ChunkedFileHeader,
} from './chunked-decrypt'
