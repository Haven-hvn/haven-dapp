/**
 * CacheInitProvider Component
 *
 * Provider component that initializes the cache layer.
 * Mount once at the app root, inside the wallet provider.
 */

'use client'

import { ReactNode } from 'react'
import { useCacheInit } from '../../hooks/useCacheInit'

/**
 * Props for CacheInitProvider
 */
interface CacheInitProviderProps {
  children: ReactNode
  /**
   * Wallet address from your wallet provider
   * Example: from useAppKitAccount().address
   */
  walletAddress?: string
  /**
   * Connection status from your wallet provider
   * Example: from useAppKitAccount().isConnected
   */
  isConnected?: boolean
}

/**
 * Provider component that initializes the cache layer.
 * Mount once at the app root, inside the wallet provider.
 *
 * Usage with Reown AppKit:
 * ```tsx
 * import { useAppKitAccount } from '@reown/appkit/react'
 * import { CacheInitProvider } from '@/components/providers/CacheInitProvider'
 * import { QueryProvider } from '@/components/providers/QueryProvider'
 * 
 * function AppWithCache({ children }: { children: React.ReactNode }) {
 *   const { address, isConnected } = useAppKitAccount()
 *   
 *   return (
 *     <CacheInitProvider walletAddress={address} isConnected={isConnected}>
 *       <QueryProvider>
 *         {children}
 *       </QueryProvider>
 *     </CacheInitProvider>
 *   )
 * }
 * ```
 *
 * Important: Must be placed AFTER wallet provider (needs wallet state)
 * and BEFORE query provider (cache must be ready before React Query fetches).
 */
export function CacheInitProvider({ 
  children, 
  walletAddress, 
  isConnected = false 
}: CacheInitProviderProps) {
  useCacheInit(walletAddress, isConnected)
  return <>{children}</>
}
