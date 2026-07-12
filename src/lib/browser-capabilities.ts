/**
 * Browser Capabilities Detection
 *
 * Detects browser APIs and features to configure the caching system
 * appropriately for each browser and environment.
 *
 * @module lib/browser-capabilities
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Browser capability detection result.
 */
export interface BrowserCapabilities {
  /** Whether Service Worker API is available */
  serviceWorker: boolean
  /** Whether Cache API is available */
  cacheApi: boolean
  /** Whether Origin Private File System is available */
  opfs: boolean
  /** Whether persistent storage API is available */
  persistentStorage: boolean
  /** Whether storage estimate API is available */
  storageEstimate: boolean
  /** Whether device memory API is available */
  deviceMemory: boolean
  /** Whether performance memory API is available */
  performanceMemory: boolean
  /** Whether network connection API is available */
  connectionApi: boolean
  /** Whether video cache can be used (SW + Cache API) */
  canUseVideoCache: boolean
  /** Whether OPFS can be used for staging */
  canUseOpfsStaging: boolean
  /** Whether any memory detection is available */
  canDetectMemory: boolean
  /** Whether connection detection is available */
  canDetectConnection: boolean
  /** Detected browser type */
  browser: 'chrome' | 'firefox' | 'safari' | 'edge' | 'other'
  /** Whether device is mobile */
  isMobile: boolean
  /** Whether running in secure context (HTTPS) */
  isSecureContext: boolean
}

/**
 * Cache system configuration based on detected capabilities.
 */
export interface CacheSystemConfig {
  /** Whether to enable the video cache at all */
  enabled: boolean
  /** Whether to use Service Worker for serving */
  useServiceWorker: boolean
  /** Whether to use OPFS for staging large files */
  useOpfsStaging: boolean
  /** Whether to request persistent storage */
  requestPersistence: boolean
  /** Whether to enable prefetching */
  enablePrefetch: boolean
  /** Memory detection strategy */
  memoryStrategy: 'api' | 'heuristic' | 'conservative'
  /** Maximum recommended file size for in-memory decryption (bytes) */
  maxInMemorySize: number
  /** Reasons for any disabled features */
  disabledReasons: string[]
}

// ============================================================================
// Feature Detection
// ============================================================================

/**
 * Detect browser type from user agent string.
 *
 * @returns Detected browser type
 */
function detectBrowser(): 'chrome' | 'firefox' | 'safari' | 'edge' | 'other' {
  if (typeof navigator === 'undefined') return 'other'

  const ua = navigator.userAgent

  // Edge detection must come before Chrome (Edge includes Chrome/ in UA)
  if (ua.includes('Edg/')) return 'edge'
  if (ua.includes('Firefox/')) return 'firefox'
  // Safari detection: includes Safari/ but not Chrome/ (Chrome includes both)
  if (ua.includes('Safari/') && !ua.includes('Chrome/')) return 'safari'
  if (ua.includes('Chrome/')) return 'chrome'

  return 'other'
}

/**
 * Detect if the current device is mobile.
 *
 * @returns True if mobile device detected
 */
function detectMobile(): boolean {
  if (typeof navigator === 'undefined') return false

  return /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  )
}

/**
 * Detect all browser capabilities.
 *
 * This function checks for the availability of various browser APIs
 * used by the caching system. It runs safely in any environment,
 * including server-side rendering contexts.
 *
 * @returns Complete capability detection result
 *
 * @example
 * ```typescript
 * const caps = detectCapabilities()
 * if (caps.canUseVideoCache) {
 *   console.log('Video caching is supported')
 * }
 * if (caps.browser === 'safari') {
 *   console.log('Safari-specific optimizations applied')
 * }
 * ```
 */
export function detectCapabilities(): BrowserCapabilities {
  // Check if we're in a browser environment
  const isBrowser = typeof window !== 'undefined' && typeof navigator !== 'undefined'

  // Secure context check (required for Service Workers)
  const isSecureContext = isBrowser && window.isSecureContext

  // Core caching APIs
  const serviceWorker = isSecureContext && 'serviceWorker' in navigator
  const cacheApi = typeof caches !== 'undefined'

  // Storage APIs
  const opfs =
    isBrowser &&
    'storage' in navigator &&
    typeof navigator.storage === 'object' &&
    navigator.storage !== null &&
    'getDirectory' in navigator.storage

  const persistentStorage =
    isBrowser &&
    'storage' in navigator &&
    typeof navigator.storage === 'object' &&
    navigator.storage !== null &&
    'persist' in navigator.storage

  const storageEstimate =
    isBrowser &&
    'storage' in navigator &&
    typeof navigator.storage === 'object' &&
    navigator.storage !== null &&
    'estimate' in navigator.storage

  // Memory APIs
  const deviceMemory = 'deviceMemory' in navigator
  const performanceMemory =
    typeof performance !== 'undefined' &&
    'memory' in performance &&
    typeof (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory ===
      'object'

  // Network API
  const connectionApi = 'connection' in navigator

  // Build capabilities object
  const capabilities: BrowserCapabilities = {
    // Core caching
    serviceWorker,
    cacheApi,

    // Storage
    opfs,
    persistentStorage,
    storageEstimate,

    // Memory
    deviceMemory,
    performanceMemory,

    // Network
    connectionApi,

    // Computed
    canUseVideoCache: serviceWorker && cacheApi,
    canUseOpfsStaging: opfs,
    canDetectMemory: deviceMemory || performanceMemory,
    canDetectConnection: connectionApi,

    // Browser identification
    browser: detectBrowser(),
    isMobile: detectMobile(),
    isSecureContext,
  }

  return capabilities
}

// ============================================================================
// Configuration Builder
// ============================================================================

/**
 * Default maximum in-memory size for different environments (bytes).
 */
const DEFAULT_MEMORY_LIMITS = {
  default: 500 * 1024 * 1024, // 500MB
  safari: 250 * 1024 * 1024, // 250MB
  mobile: 200 * 1024 * 1024, // 200MB
}

/**
 * Build cache configuration based on detected capabilities.
 *
 * This function creates a cache system configuration that is appropriate
 * for the current browser and device. It applies browser-specific workarounds
 * and mobile optimizations automatically.
 *
 * @param capabilities - Detected browser capabilities
 * @returns Cache system configuration
 *
 * @example
 * ```typescript
 * const caps = detectCapabilities()
 * const config = buildCacheConfig(caps)
 *
 * if (config.enabled) {
 *   initializeVideoCache(config)
 * }
 * ```
 */
export function buildCacheConfig(
  capabilities: BrowserCapabilities
): CacheSystemConfig {
  const disabledReasons: string[] = []

  // Base configuration
  const config: CacheSystemConfig = {
    enabled: capabilities.canUseVideoCache,
    useServiceWorker: capabilities.serviceWorker,
    useOpfsStaging: capabilities.canUseOpfsStaging,
    requestPersistence: capabilities.persistentStorage,
    enablePrefetch: capabilities.canUseVideoCache && !capabilities.isMobile,
    memoryStrategy: capabilities.canDetectMemory ? 'api' : 'conservative',
    maxInMemorySize: DEFAULT_MEMORY_LIMITS.default,
    disabledReasons,
  }

  // Browser-specific adjustments

  // Safari: Disable OPFS (unreliable) and reduce memory limits
  if (capabilities.browser === 'safari') {
    config.useOpfsStaging = false
    config.maxInMemorySize = DEFAULT_MEMORY_LIMITS.safari
    disabledReasons.push('OPFS disabled on Safari due to reliability issues')

    // Additional Safari-specific check for Service Worker support
    if (!capabilities.canUseVideoCache) {
      disabledReasons.push('Limited Service Worker support in this Safari version')
    }
  }

  // Firefox: Check for specific OPFS issues
  if (capabilities.browser === 'firefox') {
    // Firefox has partial OPFS support - may need additional testing
    // For now, keep OPFS enabled but note potential issues
    if (!capabilities.opfs) {
      disabledReasons.push('OPFS not available in Firefox (requires Firefox 111+)')
    }
  }

  // Mobile adjustments
  if (capabilities.isMobile) {
    config.maxInMemorySize = DEFAULT_MEMORY_LIMITS.mobile
    config.enablePrefetch = false
    disabledReasons.push('Prefetch disabled on mobile to save battery and data')

    // Conservative memory strategy on mobile
    if (!capabilities.canDetectMemory) {
      config.memoryStrategy = 'conservative'
    }
  }

  // Non-secure context: disable everything
  if (!capabilities.isSecureContext) {
    config.enabled = false
    config.useServiceWorker = false
    config.useOpfsStaging = false
    config.enablePrefetch = false
    disabledReasons.push('Service Workers require HTTPS (secure context)')
  }

  // Core APIs missing
  if (!capabilities.serviceWorker) {
    config.enabled = false
    disabledReasons.push('Service Worker API not available')
  }

  if (!capabilities.cacheApi) {
    config.enabled = false
    disabledReasons.push('Cache API not available')
  }

  return config
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format capabilities for display in debug UI.
 *
 * @param capabilities - Browser capabilities
 * @returns Human-readable summary
 */
export function formatCapabilities(capabilities: BrowserCapabilities): string {
  const parts: string[] = []

  parts.push(`Browser: ${capabilities.browser}`)
  parts.push(`Mobile: ${capabilities.isMobile ? 'yes' : 'no'}`)
  parts.push(`Secure Context: ${capabilities.isSecureContext ? 'yes' : 'no'}`)
  parts.push(`Video Cache: ${capabilities.canUseVideoCache ? 'available' : 'unavailable'}`)
  parts.push(`OPFS: ${capabilities.opfs ? 'available' : 'unavailable'}`)
  parts.push(`Memory Detection: ${capabilities.canDetectMemory ? 'available' : 'unavailable'}`)

  return parts.join(' | ')
}

/**
 * Check if the current environment supports the video cache.
 *
 * This is a quick check for components that need to know if caching
 * is available without getting the full configuration.
 *
 * @returns True if video cache can be used
 */
export function isVideoCacheSupported(): boolean {
  return detectCapabilities().canUseVideoCache
}

/**
 * Get a warning message if required APIs are not available.
 *
 * @returns Warning message or null if all good
 */
export function getCapabilitiesWarning(): string | null {
  const caps = detectCapabilities()

  if (!caps.isSecureContext) {
    return 'Video caching requires HTTPS. Some features may not work correctly.'
  }

  if (!caps.serviceWorker) {
    return 'Service Workers are not supported in this browser. Offline mode unavailable.'
  }

  if (!caps.cacheApi) {
    return 'Cache API is not supported in this browser. Video caching unavailable.'
  }

  return null
}
