# Task 5.4: Browser Compatibility & Feature Detection

## Objective

Create a feature detection system that identifies which browser APIs are available and configures the caching system accordingly. Ensure the app works correctly across Chrome, Firefox, Safari, Edge, and mobile browsers. The app requires Service Worker and Cache API support (available in all modern browsers).

## Background

The caching system relies on several modern browser APIs with varying support:

| API | Chrome | Firefox | Safari | Edge | Mobile |
|-----|--------|---------|--------|------|--------|
| Service Worker | ✅ | ✅ | ✅ | ✅ | ✅ |
| Cache API | ✅ | ✅ | ✅ | ✅ | ✅ |
| OPFS | ✅ | ✅ | ⚠️ Partial | ✅ | ⚠️ |
| `navigator.storage.persist()` | ✅ | ✅ | ❌ | ✅ | ✅ |
| `navigator.storage.estimate()` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `navigator.deviceMemory` | ✅ | ❌ | ❌ | ✅ | ✅ |
| `performance.memory` | ✅ | ❌ | ❌ | ✅ | ✅ |
| `navigator.connection` | ✅ | ❌ | ❌ | ✅ | ✅ |

## Requirements

### Feature Detection Module (`src/lib/browser-capabilities.ts`)

```typescript
interface BrowserCapabilities {
  // Core caching
  serviceWorker: boolean
  cacheApi: boolean
  
  // Storage
  opfs: boolean
  persistentStorage: boolean
  storageEstimate: boolean
  
  // Memory
  deviceMemory: boolean
  performanceMemory: boolean
  
  // Network
  connectionApi: boolean
  
  // Computed
  canUseVideoCache: boolean      // SW + Cache API
  canUseOpfsStaging: boolean     // OPFS available
  canDetectMemory: boolean       // Any memory API
  canDetectConnection: boolean   // Connection API
  
  // Browser identification
  browser: 'chrome' | 'firefox' | 'safari' | 'edge' | 'other'
  isMobile: boolean
  isSecureContext: boolean
}
```

### Capability-Based Configuration

Based on detected capabilities, automatically configure the caching system:

```typescript
interface CacheSystemConfig {
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
  
  /** Maximum recommended file size for in-memory decryption */
  maxInMemorySize: number
  
  /** Reason for any disabled features */
  disabledReasons: string[]
}
```

## Implementation Details

### Feature Detection

```typescript
// src/lib/browser-capabilities.ts

export function detectCapabilities(): BrowserCapabilities {
  const isSecureContext = typeof window !== 'undefined' && window.isSecureContext
  
  const capabilities: BrowserCapabilities = {
    // Core
    serviceWorker: isSecureContext && 'serviceWorker' in navigator,
    cacheApi: typeof caches !== 'undefined',
    
    // Storage
    opfs: typeof navigator !== 'undefined' && 
          'storage' in navigator && 
          'getDirectory' in (navigator.storage || {}),
    persistentStorage: typeof navigator !== 'undefined' && 
                       'storage' in navigator && 
                       'persist' in (navigator.storage || {}),
    storageEstimate: typeof navigator !== 'undefined' && 
                     'storage' in navigator && 
                     'estimate' in (navigator.storage || {}),
    
    // Memory
    deviceMemory: 'deviceMemory' in navigator,
    performanceMemory: 'memory' in performance,
    
    // Network
    connectionApi: 'connection' in navigator,
    
    // Computed
    canUseVideoCache: false, // Set below
    canUseOpfsStaging: false,
    canDetectMemory: false,
    canDetectConnection: false,
    
    // Browser
    browser: detectBrowser(),
    isMobile: /iPhone|iPad|iPod|Android/i.test(navigator.userAgent),
    isSecureContext,
  }
  
  // Computed capabilities
  capabilities.canUseVideoCache = capabilities.serviceWorker && capabilities.cacheApi
  capabilities.canUseOpfsStaging = capabilities.opfs
  capabilities.canDetectMemory = capabilities.deviceMemory || capabilities.performanceMemory
  capabilities.canDetectConnection = capabilities.connectionApi
  
  return capabilities
}

function detectBrowser(): 'chrome' | 'firefox' | 'safari' | 'edge' | 'other' {
  const ua = navigator.userAgent
  if (ua.includes('Edg/')) return 'edge'
  if (ua.includes('Chrome/') && !ua.includes('Edg/')) return 'chrome'
  if (ua.includes('Firefox/')) return 'firefox'
  if (ua.includes('Safari/') && !ua.includes('Chrome/')) return 'safari'
  return 'other'
}
```

### Configuration Builder

```typescript
export function buildCacheConfig(
  capabilities: BrowserCapabilities
): CacheSystemConfig {
  const config: CacheSystemConfig = {
    enabled: capabilities.canUseVideoCache,
    useServiceWorker: capabilities.serviceWorker,
    useOpfsStaging: capabilities.canUseOpfsStaging,
    requestPersistence: capabilities.persistentStorage,
    enablePrefetch: capabilities.canUseVideoCache && !capabilities.isMobile,
    memoryStrategy: capabilities.canDetectMemory ? 'api' : 'conservative',
    maxInMemorySize: 500 * 1024 * 1024, // 500MB default
    disabledReasons: [],
  }
  
  // Safari-specific adjustments
  if (capabilities.browser === 'safari') {
    config.useOpfsStaging = false // Safari OPFS is unreliable
    config.maxInMemorySize = 250 * 1024 * 1024 // 250MB on Safari
    if (!capabilities.canUseVideoCache) {
      config.disabledReasons.push('Safari has limited Service Worker support')
    }
  }
  
  // Mobile adjustments
  if (capabilities.isMobile) {
    config.maxInMemorySize = 200 * 1024 * 1024 // 200MB on mobile
    config.enablePrefetch = false // Don't prefetch on mobile (battery/data)
    config.disabledReasons.push('Prefetch disabled on mobile to save battery and data')
  }
  
  // Non-secure context
  if (!capabilities.isSecureContext) {
    config.enabled = false
    config.useServiceWorker = false
    config.disabledReasons.push('Service Workers require HTTPS')
  }
  
  return config
}
```

### Capabilities Context

```typescript
// src/components/providers/CapabilitiesProvider.tsx
'use client'

import { createContext, useContext, useMemo } from 'react'
import { detectCapabilities, buildCacheConfig } from '@/lib/browser-capabilities'
import type { BrowserCapabilities, CacheSystemConfig } from '@/lib/browser-capabilities'

interface CapabilitiesContextValue {
  capabilities: BrowserCapabilities
  cacheConfig: CacheSystemConfig
}

const CapabilitiesContext = createContext<CapabilitiesContextValue | null>(null)

export function CapabilitiesProvider({ children }: { children: React.ReactNode }) {
  const value = useMemo(() => {
    const capabilities = detectCapabilities()
    const cacheConfig = buildCacheConfig(capabilities)
    return { capabilities, cacheConfig }
  }, [])
  
  return (
    <CapabilitiesContext.Provider value={value}>
      {children}
    </CapabilitiesContext.Provider>
  )
}

export function useCapabilities() {
  const ctx = useContext(CapabilitiesContext)
  if (!ctx) throw new Error('useCapabilities must be used within CapabilitiesProvider')
  return ctx
}
```

### Debug Panel (Development Only)

```typescript
// Show capabilities in settings for debugging
function CapabilitiesDebug() {
  const { capabilities, cacheConfig } = useCapabilities()
  
  if (process.env.NODE_ENV !== 'development') return null
  
  return (
    <details className="mt-4 p-3 bg-white/5 rounded-lg text-xs">
      <summary className="text-white/40 cursor-pointer">Browser Capabilities</summary>
      <pre className="mt-2 text-white/30 overflow-auto">
        {JSON.stringify({ capabilities, cacheConfig }, null, 2)}
      </pre>
    </details>
  )
}
```

## Acceptance Criteria

- [ ] `detectCapabilities()` correctly identifies all browser APIs
- [ ] `buildCacheConfig()` produces appropriate config for each browser
- [ ] Safari gets OPFS disabled and reduced memory limits
- [ ] Mobile gets prefetch disabled and reduced memory limits
- [ ] Non-HTTPS contexts get caching disabled entirely
- [ ] `CapabilitiesProvider` makes capabilities available via context
- [ ] `useCapabilities()` hook works throughout the app
- [ ] All caching modules check capabilities before using APIs
- [ ] Debug panel shows capabilities in development mode
- [ ] No errors thrown on any supported browser
- [ ] Clear error message shown if required APIs (Service Worker, Cache API) are not available

## Dependencies

- None (this is a foundational utility used by all other tasks)

## Estimated Effort

Medium (4-5 hours)