'use client'

import { useEffect, useRef } from 'react'
import { useAccount } from 'wagmi'
import {
  onWalletDisconnect,
  onAccountChange,
  onChainChange,
} from '@/lib/security-cleanup'

/**
 * Hook to detect wallet/account/chain changes and trigger security cleanup.
 *
 * Uses wagmi's useAccount hook to detect:
 * - Wallet disconnect: triggers full auth cleanup
 * - Account change: clears old account's auth state
 * - Chain change: clears chain-specific session
 *
 * This hook should be used once at the app level, typically inside a
 * provider component that wraps the application.
 *
 * @example
 * ```tsx
 * // In SecurityCleanupProvider.tsx
 * export function SecurityCleanupProvider({ children }) {
 *   useSecurityCleanup()
 *   return <>{children}</>
 * }
 * ```
 */
export function useSecurityCleanup(): void {
  const { address, isConnected, chainId } = useAccount()
  const prevAddressRef = useRef<string | undefined>(address)
  const prevChainRef = useRef<number | undefined>(chainId)
  const isFirstRender = useRef(true)

  // Handle address changes (disconnect and account switch)
  useEffect(() => {
    const prevAddress = prevAddressRef.current

    // Skip on first render - we only want to detect actual changes
    if (isFirstRender.current) {
      prevAddressRef.current = address
      return
    }

    // Detect disconnect (was connected, now disconnected)
    if (prevAddress && !isConnected) {
      onWalletDisconnect(prevAddress)
    }
    // Detect account change (was connected with different address)
    else if (prevAddress && address && prevAddress !== address) {
      onAccountChange(prevAddress, address)
    }
    // Detect connect (was disconnected, now connected)
    // No cleanup needed on connect, but we update the ref

    prevAddressRef.current = address
  }, [address, isConnected])

  // Handle chain changes
  useEffect(() => {
    const prevChain = prevChainRef.current

    // Skip on first render
    if (isFirstRender.current) {
      prevChainRef.current = chainId
      isFirstRender.current = false
      return
    }

    // Detect chain change (both old and new are valid and different)
    if (prevChain && chainId && prevChain !== chainId) {
      onChainChange(prevChain, chainId)
    }

    prevChainRef.current = chainId
  }, [chainId])
}
