/**
 * CacheProvider Component
 *
 * Combines cache initialization and background sync into a single provider.
 * Uses useAppKitAccount to get wallet state and passes it to the cache layer.
 *
 * Must be mounted INSIDE ContextProvider (needs wagmi + AppKit) and
 * INSIDE SecurityCleanupProvider (security cleanup should run before cache init).
 */

'use client'

import { type ReactNode } from 'react'
import { useAppKitAccount } from '@reown/appkit/react'
import { useCacheInit } from '../../hooks/useCacheInit'
import { useBackgroundSync } from '../../hooks/useBackgroundSync'

interface CacheProviderProps {
  children: ReactNode
}

/**
 * Provider that initializes the IndexedDB cache and starts the background
 * sync engine when a wallet is connected.
 *
 * Place in the component tree after the wallet provider (ContextProvider)
 * and SecurityCleanupProvider:
 *
 * ```
 * <ContextProvider>
 *   <SecurityCleanupProvider>
 *     <CacheProvider>
 *       <AuthProvider>
 *         ...
 *       </AuthProvider>
 *     </CacheProvider>
 *   </SecurityCleanupProvider>
 * </ContextProvider>
 * ```
 */
export function CacheProvider({ children }: CacheProviderProps) {
  const { address, isConnected } = useAppKitAccount()

  // Initialize IndexedDB cache when wallet connects
  useCacheInit(address, isConnected)

  // Start background sync engine (respects isInitialized gate in the hook)
  useBackgroundSync()

  return <>{children}</>
}