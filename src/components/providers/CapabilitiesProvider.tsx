'use client'

/**
 * Capabilities Provider
 *
 * React context provider that makes browser capabilities and cache
 * configuration available throughout the application.
 *
 * @module components/providers/CapabilitiesProvider
 */

import React, { createContext, useContext, useMemo, type ReactNode } from 'react'
import {
  detectCapabilities,
  buildCacheConfig,
  type BrowserCapabilities,
  type CacheSystemConfig,
} from '@/lib/browser-capabilities'

// ============================================================================
// Context Types
// ============================================================================

/**
 * Capabilities context value.
 */
export interface CapabilitiesContextValue {
  /** Detected browser capabilities */
  capabilities: BrowserCapabilities
  /** Cache system configuration based on capabilities */
  cacheConfig: CacheSystemConfig
}

// ============================================================================
// Context Creation
// ============================================================================

const CapabilitiesContext = createContext<CapabilitiesContextValue | null>(null)

// ============================================================================
// Provider Component
// ============================================================================

/**
 * Props for CapabilitiesProvider.
 */
interface CapabilitiesProviderProps {
  /** Child components */
  children: ReactNode
}

/**
 * Provider component that detects browser capabilities and provides
 * the cache configuration to child components.
 *
 * This provider should be mounted early in the app tree, ideally
 * near the root, so that all components can access capability information.
 *
 * @example
 * ```tsx
 * // In your root layout or app entry
 * import { CapabilitiesProvider } from '@/components/providers/CapabilitiesProvider'
 *
 * export default function App({ children }) {
 *   return (
 *     <CapabilitiesProvider>
 *       <ServiceWorkerProvider>
 *         {children}
 *       </ServiceWorkerProvider>
 *     </CapabilitiesProvider>
 *   )
 * }
 * ```
 *
 * @example
 * ```tsx
 * // In a child component
 * import { useCapabilities } from '@/components/providers/CapabilitiesProvider'
 *
 * function VideoPlayer() {
 *   const { capabilities, cacheConfig } = useCapabilities()
 *
 *   if (!cacheConfig.enabled) {
 *     return <div>Video caching not available: {cacheConfig.disabledReasons.join(', ')}</div>
 *   }
 *
 *   return <video src={...} />
 * }
 * ```
 */
export function CapabilitiesProvider({ children }: CapabilitiesProviderProps) {
  const value = useMemo(() => {
    // Detect capabilities once during initialization
    const capabilities = detectCapabilities()
    const cacheConfig = buildCacheConfig(capabilities)

    // Log capabilities in development for debugging
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.log('[Capabilities] Detected:', {
        browser: capabilities.browser,
        isMobile: capabilities.isMobile,
        canUseVideoCache: capabilities.canUseVideoCache,
        canUseOpfsStaging: capabilities.canUseOpfsStaging,
        cacheEnabled: cacheConfig.enabled,
      })

      // Log any disabled features with reasons
      if (cacheConfig.disabledReasons.length > 0) {
        // eslint-disable-next-line no-console
        console.log('[Capabilities] Disabled features:', cacheConfig.disabledReasons)
      }
    }

    return { capabilities, cacheConfig }
  }, [])

  return (
    <CapabilitiesContext.Provider value={value}>
      {children}
    </CapabilitiesContext.Provider>
  )
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to access the capabilities context.
 *
 * Use this hook in child components to check browser capabilities
 * and cache configuration.
 *
 * @returns The current capabilities context value
 * @throws Error if used outside of CapabilitiesProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { capabilities, cacheConfig } = useCapabilities()
 *
 *   if (!capabilities.canUseVideoCache) {
 *     return <div>Video cache not supported</div>
 *   }
 *
 *   return <div>Cache enabled: {cacheConfig.enabled ? 'yes' : 'no'}</div>
 * }
 * ```
 */
export function useCapabilities(): CapabilitiesContextValue {
  const context = useContext(CapabilitiesContext)

  if (context === null) {
    throw new Error(
      'useCapabilities must be used within a CapabilitiesProvider. ' +
        'Make sure to wrap your app with <CapabilitiesProvider>.'
    )
  }

  return context
}

// ============================================================================
// Debug Component
// ============================================================================

/**
 * Debug panel component that displays browser capabilities.
 *
 * This component is only rendered in development mode and shows
 * detailed information about detected browser capabilities.
 *
 * @example
 * ```tsx
 * // In your settings or debug page
 * function SettingsPage() {
 *   return (
 *     <div>
 *       <h1>Settings</h1>
 *       <CapabilitiesDebug />
 *     </div>
 *   )
 * }
 * ```
 */
export function CapabilitiesDebug(): React.ReactNode {
  const { capabilities, cacheConfig } = useCapabilities()

  // Only show in development mode
  if (process.env.NODE_ENV !== 'development') {
    return null
  }

  return (
    <details className="mt-4 rounded-lg border border-white/10 bg-white/5 p-3 text-xs">
      <summary className="cursor-pointer text-white/60 hover:text-white/80">
        Browser Capabilities (Debug)
      </summary>
      <div className="mt-3 space-y-2">
        <div>
          <h4 className="mb-1 font-semibold text-white/50">Browser Info</h4>
          <pre className="overflow-auto rounded bg-black/20 p-2 text-white/40">
            {JSON.stringify(
              {
                browser: capabilities.browser,
                isMobile: capabilities.isMobile,
                isSecureContext: capabilities.isSecureContext,
              },
              null,
              2
            )}
          </pre>
        </div>

        <div>
          <h4 className="mb-1 font-semibold text-white/50">API Support</h4>
          <pre className="overflow-auto rounded bg-black/20 p-2 text-white/40">
            {JSON.stringify(
              {
                serviceWorker: capabilities.serviceWorker,
                cacheApi: capabilities.cacheApi,
                opfs: capabilities.opfs,
                persistentStorage: capabilities.persistentStorage,
                storageEstimate: capabilities.storageEstimate,
                deviceMemory: capabilities.deviceMemory,
                performanceMemory: capabilities.performanceMemory,
                connectionApi: capabilities.connectionApi,
              },
              null,
              2
            )}
          </pre>
        </div>

        <div>
          <h4 className="mb-1 font-semibold text-white/50">Computed Capabilities</h4>
          <pre className="overflow-auto rounded bg-black/20 p-2 text-white/40">
            {JSON.stringify(
              {
                canUseVideoCache: capabilities.canUseVideoCache,
                canUseOpfsStaging: capabilities.canUseOpfsStaging,
                canDetectMemory: capabilities.canDetectMemory,
                canDetectConnection: capabilities.canDetectConnection,
              },
              null,
              2
            )}
          </pre>
        </div>

        <div>
          <h4 className="mb-1 font-semibold text-white/50">Cache Configuration</h4>
          <pre className="overflow-auto rounded bg-black/20 p-2 text-white/40">
            {JSON.stringify(
              {
                enabled: cacheConfig.enabled,
                useServiceWorker: cacheConfig.useServiceWorker,
                useOpfsStaging: cacheConfig.useOpfsStaging,
                requestPersistence: cacheConfig.requestPersistence,
                enablePrefetch: cacheConfig.enablePrefetch,
                memoryStrategy: cacheConfig.memoryStrategy,
                maxInMemorySize: `${(cacheConfig.maxInMemorySize / (1024 * 1024)).toFixed(0)}MB`,
                disabledReasons: cacheConfig.disabledReasons,
              },
              null,
              2
            )}
          </pre>
        </div>
      </div>
    </details>
  )
}
