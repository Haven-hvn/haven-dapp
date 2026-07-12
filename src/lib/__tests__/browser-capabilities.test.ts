/**
 * Browser Capabilities Detection Tests
 *
 * Tests for the browser capabilities detection and cache configuration.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  detectCapabilities,
  buildCacheConfig,
  formatCapabilities,
  isVideoCacheSupported,
  getCapabilitiesWarning,
  type BrowserCapabilities,
} from '../browser-capabilities'

describe('detectCapabilities', () => {
  const originalNavigator = global.navigator
  const originalWindow = global.window
  const originalCaches = global.caches
  const originalPerformance = global.performance

  beforeEach(() => {
    // Reset mocks
    vi.resetAllMocks()

    // Setup default mock environment (Chrome-like)
    Object.defineProperty(global, 'navigator', {
      value: {
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        storage: {
          getDirectory: vi.fn(),
          persist: vi.fn(),
          estimate: vi.fn(),
        },
      },
      writable: true,
      configurable: true,
    })

    Object.defineProperty(global, 'window', {
      value: { isSecureContext: true },
      writable: true,
      configurable: true,
    })

    Object.defineProperty(global, 'caches', {
      value: {},
      writable: true,
      configurable: true,
    })

    Object.defineProperty(global, 'performance', {
      value: {},
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    })
    Object.defineProperty(global, 'window', {
      value: originalWindow,
      writable: true,
      configurable: true,
    })
    Object.defineProperty(global, 'caches', {
      value: originalCaches,
      writable: true,
      configurable: true,
    })
    Object.defineProperty(global, 'performance', {
      value: originalPerformance,
      writable: true,
      configurable: true,
    })
  })

  it('detects Chrome browser', () => {
    const caps = detectCapabilities()
    expect(caps.browser).toBe('chrome')
  })

  it('detects Firefox browser', () => {
    Object.defineProperty(global, 'navigator', {
      value: {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
        storage: {
          getDirectory: vi.fn(),
          persist: vi.fn(),
          estimate: vi.fn(),
        },
      },
      writable: true,
      configurable: true,
    })

    const caps = detectCapabilities()
    expect(caps.browser).toBe('firefox')
  })

  it('detects Safari browser', () => {
    Object.defineProperty(global, 'navigator', {
      value: {
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
        storage: {
          getDirectory: vi.fn(),
          persist: vi.fn(),
          estimate: vi.fn(),
        },
      },
      writable: true,
      configurable: true,
    })

    const caps = detectCapabilities()
    expect(caps.browser).toBe('safari')
  })

  it('detects Edge browser', () => {
    Object.defineProperty(global, 'navigator', {
      value: {
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
        storage: {
          getDirectory: vi.fn(),
          persist: vi.fn(),
          estimate: vi.fn(),
        },
      },
      writable: true,
      configurable: true,
    })

    const caps = detectCapabilities()
    expect(caps.browser).toBe('edge')
  })

  it('detects mobile devices', () => {
    Object.defineProperty(global, 'navigator', {
      value: {
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        storage: {
          getDirectory: vi.fn(),
          persist: vi.fn(),
          estimate: vi.fn(),
        },
      },
      writable: true,
      configurable: true,
    })

    const caps = detectCapabilities()
    expect(caps.isMobile).toBe(true)
  })

  it('detects secure context', () => {
    const caps = detectCapabilities()
    expect(caps.isSecureContext).toBe(true)
  })

  it('detects non-secure context', () => {
    Object.defineProperty(global, 'window', {
      value: { isSecureContext: false },
      writable: true,
      configurable: true,
    })

    const caps = detectCapabilities()
    expect(caps.isSecureContext).toBe(false)
    expect(caps.serviceWorker).toBe(false)
  })

  it('detects service worker support', () => {
    Object.defineProperty(global, 'navigator', {
      value: {
        ...navigator,
        serviceWorker: {},
      },
      writable: true,
      configurable: true,
    })

    const caps = detectCapabilities()
    expect(caps.serviceWorker).toBe(true)
  })

  it('detects cache API support', () => {
    const caps = detectCapabilities()
    expect(caps.cacheApi).toBe(true)
  })

  it('detects OPFS support', () => {
    const caps = detectCapabilities()
    expect(caps.opfs).toBe(true)
  })

  it('detects persistent storage support', () => {
    const caps = detectCapabilities()
    expect(caps.persistentStorage).toBe(true)
  })

  it('detects storage estimate support', () => {
    const caps = detectCapabilities()
    expect(caps.storageEstimate).toBe(true)
  })

  it('detects device memory support', () => {
    Object.defineProperty(global, 'navigator', {
      value: {
        ...navigator,
        deviceMemory: 8,
      },
      writable: true,
      configurable: true,
    })

    const caps = detectCapabilities()
    expect(caps.deviceMemory).toBe(true)
    expect(caps.canDetectMemory).toBe(true)
  })

  it('detects connection API support', () => {
    Object.defineProperty(global, 'navigator', {
      value: {
        ...navigator,
        connection: {},
      },
      writable: true,
      configurable: true,
    })

    const caps = detectCapabilities()
    expect(caps.connectionApi).toBe(true)
    expect(caps.canDetectConnection).toBe(true)
  })

  it('computes canUseVideoCache correctly', () => {
    Object.defineProperty(global, 'navigator', {
      value: {
        ...navigator,
        serviceWorker: {},
      },
      writable: true,
      configurable: true,
    })

    const caps = detectCapabilities()
    expect(caps.canUseVideoCache).toBe(true)
  })

  it('returns false for canUseVideoCache when SW unavailable', () => {
    Object.defineProperty(global, 'window', {
      value: { isSecureContext: false },
      writable: true,
      configurable: true,
    })

    const caps = detectCapabilities()
    expect(caps.canUseVideoCache).toBe(false)
  })
})

describe('buildCacheConfig', () => {
  const baseCapabilities: BrowserCapabilities = {
    serviceWorker: true,
    cacheApi: true,
    opfs: true,
    persistentStorage: true,
    storageEstimate: true,
    deviceMemory: true,
    performanceMemory: false,
    connectionApi: false,
    canUseVideoCache: true,
    canUseOpfsStaging: true,
    canDetectMemory: true,
    canDetectConnection: false,
    browser: 'chrome',
    isMobile: false,
    isSecureContext: true,
  }

  it('enables cache for supported browsers', () => {
    const config = buildCacheConfig(baseCapabilities)
    expect(config.enabled).toBe(true)
    expect(config.useServiceWorker).toBe(true)
  })

  it('disables cache in non-secure context', () => {
    const caps = { ...baseCapabilities, isSecureContext: false, serviceWorker: false }
    const config = buildCacheConfig(caps)
    expect(config.enabled).toBe(false)
    expect(config.disabledReasons).toContain('Service Workers require HTTPS (secure context)')
  })

  it('disables cache when service worker unavailable', () => {
    const caps = { ...baseCapabilities, serviceWorker: false, canUseVideoCache: false }
    const config = buildCacheConfig(caps)
    expect(config.enabled).toBe(false)
    expect(config.disabledReasons).toContain('Service Worker API not available')
  })

  it('disables cache when cache API unavailable', () => {
    const caps = { ...baseCapabilities, cacheApi: false, canUseVideoCache: false }
    const config = buildCacheConfig(caps)
    expect(config.enabled).toBe(false)
    expect(config.disabledReasons).toContain('Cache API not available')
  })

  it('disables OPFS for Safari', () => {
    const caps = { ...baseCapabilities, browser: 'safari' }
    const config = buildCacheConfig(caps)
    expect(config.useOpfsStaging).toBe(false)
    expect(config.disabledReasons).toContain('OPFS disabled on Safari due to reliability issues')
  })

  it('reduces memory limit for Safari', () => {
    const caps = { ...baseCapabilities, browser: 'safari' }
    const config = buildCacheConfig(caps)
    expect(config.maxInMemorySize).toBe(250 * 1024 * 1024) // 250MB
  })

  it('disables prefetch on mobile', () => {
    const caps = { ...baseCapabilities, isMobile: true }
    const config = buildCacheConfig(caps)
    expect(config.enablePrefetch).toBe(false)
    expect(config.disabledReasons).toContain('Prefetch disabled on mobile to save battery and data')
  })

  it('reduces memory limit for mobile', () => {
    const caps = { ...baseCapabilities, isMobile: true }
    const config = buildCacheConfig(caps)
    expect(config.maxInMemorySize).toBe(200 * 1024 * 1024) // 200MB
  })

  it('uses conservative memory strategy without detection', () => {
    const caps = {
      ...baseCapabilities,
      deviceMemory: false,
      canDetectMemory: false,
    }
    const config = buildCacheConfig(caps)
    expect(config.memoryStrategy).toBe('conservative')
  })

  it('uses API memory strategy with detection', () => {
    const caps = { ...baseCapabilities, deviceMemory: true, canDetectMemory: true }
    const config = buildCacheConfig(caps)
    expect(config.memoryStrategy).toBe('api')
  })

  it('requests persistence when available', () => {
    const caps = { ...baseCapabilities, persistentStorage: true }
    const config = buildCacheConfig(caps)
    expect(config.requestPersistence).toBe(true)
  })

  it('enables prefetch on desktop when supported', () => {
    const caps = { ...baseCapabilities, isMobile: false, canUseVideoCache: true }
    const config = buildCacheConfig(caps)
    expect(config.enablePrefetch).toBe(true)
  })

  it('sets default max in-memory size to 500MB', () => {
    const config = buildCacheConfig(baseCapabilities)
    expect(config.maxInMemorySize).toBe(500 * 1024 * 1024)
  })

  it('includes all disabled reasons', () => {
    const caps = {
      ...baseCapabilities,
      isSecureContext: false,
      serviceWorker: false,
      cacheApi: false,
      canUseVideoCache: false,
    }
    const config = buildCacheConfig(caps)
    expect(config.disabledReasons.length).toBeGreaterThan(0)
    expect(config.disabledReasons).toContain('Service Workers require HTTPS (secure context)')
    expect(config.disabledReasons).toContain('Service Worker API not available')
    expect(config.disabledReasons).toContain('Cache API not available')
  })
})

describe('formatCapabilities', () => {
  it('formats capabilities as readable string', () => {
    const caps: BrowserCapabilities = {
      serviceWorker: true,
      cacheApi: true,
      opfs: true,
      persistentStorage: true,
      storageEstimate: true,
      deviceMemory: true,
      performanceMemory: false,
      connectionApi: false,
      canUseVideoCache: true,
      canUseOpfsStaging: true,
      canDetectMemory: true,
      canDetectConnection: false,
      browser: 'chrome',
      isMobile: false,
      isSecureContext: true,
    }

    const formatted = formatCapabilities(caps)
    expect(formatted).toContain('Browser: chrome')
    expect(formatted).toContain('Mobile: no')
    expect(formatted).toContain('Secure Context: yes')
    expect(formatted).toContain('Video Cache: available')
    expect(formatted).toContain('OPFS: available')
    expect(formatted).toContain('Memory Detection: available')
  })

  it('shows unavailable for missing capabilities', () => {
    const caps: BrowserCapabilities = {
      serviceWorker: false,
      cacheApi: false,
      opfs: false,
      persistentStorage: false,
      storageEstimate: false,
      deviceMemory: false,
      performanceMemory: false,
      connectionApi: false,
      canUseVideoCache: false,
      canUseOpfsStaging: false,
      canDetectMemory: false,
      canDetectConnection: false,
      browser: 'other',
      isMobile: true,
      isSecureContext: false,
    }

    const formatted = formatCapabilities(caps)
    expect(formatted).toContain('Browser: other')
    expect(formatted).toContain('Mobile: yes')
    expect(formatted).toContain('Secure Context: no')
    expect(formatted).toContain('Video Cache: unavailable')
    expect(formatted).toContain('OPFS: unavailable')
    expect(formatted).toContain('Memory Detection: unavailable')
  })
})

describe('isVideoCacheSupported', () => {
  const originalNavigator = global.navigator
  const originalWindow = global.window
  const originalCaches = global.caches

  beforeEach(() => {
    Object.defineProperty(global, 'navigator', {
      value: {
        userAgent: 'Chrome',
        serviceWorker: {},
      },
      writable: true,
      configurable: true,
    })

    Object.defineProperty(global, 'window', {
      value: { isSecureContext: true },
      writable: true,
      configurable: true,
    })

    Object.defineProperty(global, 'caches', {
      value: {},
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    })
    Object.defineProperty(global, 'window', {
      value: originalWindow,
      writable: true,
      configurable: true,
    })
    Object.defineProperty(global, 'caches', {
      value: originalCaches,
      writable: true,
      configurable: true,
    })
  })

  it('returns true when video cache is supported', () => {
    expect(isVideoCacheSupported()).toBe(true)
  })

  it('returns false when not in secure context', () => {
    Object.defineProperty(global, 'window', {
      value: { isSecureContext: false },
      writable: true,
      configurable: true,
    })

    expect(isVideoCacheSupported()).toBe(false)
  })
})

describe('getCapabilitiesWarning', () => {
  const originalNavigator = global.navigator
  const originalWindow = global.window
  const originalCaches = global.caches

  afterEach(() => {
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    })
    Object.defineProperty(global, 'window', {
      value: originalWindow,
      writable: true,
      configurable: true,
    })
    Object.defineProperty(global, 'caches', {
      value: originalCaches,
      writable: true,
      configurable: true,
    })
  })

  it('returns null when all capabilities are available', () => {
    Object.defineProperty(global, 'navigator', {
      value: {
        userAgent: 'Chrome',
        serviceWorker: {},
      },
      writable: true,
      configurable: true,
    })

    Object.defineProperty(global, 'window', {
      value: { isSecureContext: true },
      writable: true,
      configurable: true,
    })

    Object.defineProperty(global, 'caches', {
      value: {},
      writable: true,
      configurable: true,
    })

    expect(getCapabilitiesWarning()).toBeNull()
  })

  it('returns warning for non-secure context', () => {
    Object.defineProperty(global, 'window', {
      value: { isSecureContext: false },
      writable: true,
      configurable: true,
    })

    const warning = getCapabilitiesWarning()
    expect(warning).toContain('HTTPS')
  })

  it('returns warning when service worker unavailable', () => {
    Object.defineProperty(global, 'navigator', {
      value: {
        userAgent: 'Chrome',
      },
      writable: true,
      configurable: true,
    })

    Object.defineProperty(global, 'window', {
      value: { isSecureContext: true },
      writable: true,
      configurable: true,
    })

    Object.defineProperty(global, 'caches', {
      value: {},
      writable: true,
      configurable: true,
    })

    const warning = getCapabilitiesWarning()
    expect(warning).toContain('Service Workers')
  })

  it('returns warning when cache API unavailable', () => {
    Object.defineProperty(global, 'navigator', {
      value: {
        userAgent: 'Chrome',
        serviceWorker: {},
      },
      writable: true,
      configurable: true,
    })

    Object.defineProperty(global, 'window', {
      value: { isSecureContext: true },
      writable: true,
      configurable: true,
    })

    // caches is undefined

    const warning = getCapabilitiesWarning()
    expect(warning).toContain('Cache API')
  })
})
