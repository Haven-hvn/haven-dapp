'use client'

import { useServiceWorker } from '@/hooks/useServiceWorker'
import { startPeriodicCleanup, type CacheTTLConfig } from '@/lib/cache-expiration'
import { createContext, useContext, ReactNode, useEffect } from 'react'

/**
 * Service Worker context value interface
 */
interface ServiceWorkerContextValue {
  /** True when the service worker is active and ready to handle requests */
  isReady: boolean
  /** True if service workers are supported in this environment */
  isSupported: boolean
  /** Any error that occurred during registration */
  error: Error | null
}

const ServiceWorkerContext = createContext<ServiceWorkerContextValue>({
  isReady: false,
  isSupported: false,
  error: null,
})

/**
 * Props for ServiceWorkerProvider
 */
interface ServiceWorkerProviderProps {
  children: ReactNode
  /**
   * Optional custom TTL configuration for cache expiration.
   * If not provided, default values will be used.
   */
  cacheConfig?: Partial<CacheTTLConfig>
}

/**
 * Provider component that registers and manages the Service Worker.
 * 
 * This provider should be mounted at the app root level to ensure
 * the Service Worker is registered as early as possible. It provides
 * the Service Worker state via React Context so child components
 * can check if the SW is ready.
 * 
 * @example
 * ```tsx
 * // In your root layout
 * import { ServiceWorkerProvider } from '@/components/providers/ServiceWorkerProvider'
 * 
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         <ServiceWorkerProvider>
 *           {children}
 *         </ServiceWorkerProvider>
 *       </body>
 *     </html>
 *   )
 * }
 * ```
 * 
 * @example
 * ```tsx
 * // In a child component
 * import { useServiceWorkerContext } from '@/components/providers/ServiceWorkerProvider'
 * 
 * function VideoPlayer() {
 *   const { isReady, isSupported } = useServiceWorkerContext()
 *   
 *   if (!isSupported) {
 *     return <div>Offline mode not supported</div>
 *   }
 *   
 *   return <div>{isReady ? 'Ready for offline' : 'Initializing...'}</div>
 * }
 * ```
 */
export function ServiceWorkerProvider({
  children,
  cacheConfig,
}: ServiceWorkerProviderProps) {
  const sw = useServiceWorker()

  // Start periodic cache cleanup when service worker is ready
  useEffect(() => {
    if (!sw.isReady) {
      return
    }

    // Start the periodic cleanup and get the stop function
    const stopCleanup = startPeriodicCleanup(cacheConfig)

    // Cleanup on unmount or when SW becomes not ready
    return () => {
      stopCleanup()
    }
  }, [sw.isReady, cacheConfig])

  return (
    <ServiceWorkerContext.Provider value={sw}>
      {children}
    </ServiceWorkerContext.Provider>
  )
}

/**
 * Hook to access the Service Worker context.
 * 
 * Use this hook in child components to check the Service Worker
 * registration status and readiness.
 * 
 * @returns The current Service Worker context value
 * @throws Error if used outside of ServiceWorkerProvider
 */
export function useServiceWorkerContext() {
  const context = useContext(ServiceWorkerContext)
  
  if (context === undefined) {
    throw new Error('useServiceWorkerContext must be used within a ServiceWorkerProvider')
  }
  
  return context
}

export type { ServiceWorkerContextValue }
