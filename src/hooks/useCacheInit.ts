/**
 * Cache Initialization Hook
 *
 * Initializes the cache layer when a wallet connects.
 * Should be mounted once at the app root level.
 *
 * Handles:
 * - Opening IndexedDB on wallet connect
 * - Closing IndexedDB on wallet disconnect
 * - Switching databases when wallet changes
 * - Detecting IndexedDB availability
 */

'use client'

import { useEffect, useRef, useState } from 'react'
import { useCacheStore } from '../stores/cacheStore'
import { getCacheDB, closeCacheDB, closeAllCacheDBs } from '../lib/cache/db'
import { getVideoCacheService } from '../services/cacheService'

/**
 * Initializes the cache layer when a wallet connects.
 * Should be mounted once at the app root level.
 *
 * Handles:
 * - Opening IndexedDB on wallet connect
 * - Closing IndexedDB on wallet disconnect
 * - Switching databases when wallet changes
 * - Detecting IndexedDB availability
 * - Page visibility changes
 * 
 * NOTE: This hook expects to be used within a wallet provider context
 * that provides wallet connection state. The actual wallet hook should
 * be passed in or imported based on your wallet provider setup.
 * 
 * Example with Reown AppKit:
 * ```tsx
 * import { useAppKitAccount } from '@reown/appkit/react'
 * 
 * // In your component:
 * const { address, isConnected } = useAppKitAccount()
 * ```
 */
export function useCacheInit(walletAddress?: string, isConnected: boolean = false): void {
  const previousAddress = useRef<string | null>(null)
  const initializingRef = useRef<string | null>(null)
  const { setInitialized, setAvailable, reset: resetCacheStore } = useCacheStore()

  // Handle cache initialization on wallet connect/disconnect/switch
  useEffect(() => {
    // Skip on server
    if (typeof window === 'undefined') return

    // Check IndexedDB availability once
    if (!window.indexedDB) {
      setAvailable(false)
      console.warn('[CacheInit] IndexedDB not available')
      return
    }

    async function initCache(addr: string) {
      // Track this initialization attempt
      initializingRef.current = addr

      try {
        // Close previous wallet's DB if switching
        if (previousAddress.current && previousAddress.current !== addr) {
          closeCacheDB(previousAddress.current)
          resetCacheStore()
        }

        // Open DB for new wallet (this also creates schema if needed)
        await getCacheDB(addr)

        // Check if we're still the current initialization (race condition guard)
        if (initializingRef.current !== addr) {
          // Another wallet connected while we were initializing
          closeCacheDB(addr)
          return
        }

        // Load initial cache stats
        const cacheService = getVideoCacheService(addr)
        const stats = await cacheService.getStats()
        useCacheStore.getState().setStats(stats)

        // Mark as initialized
        setInitialized(true)
        previousAddress.current = addr

        console.info(
          `[CacheInit] Cache ready for ${addr.slice(0, 8)}...`,
          `(${stats.totalVideos} cached videos)`
        )
      } catch (error) {
        console.warn('[CacheInit] Failed to initialize cache:', error)
        setAvailable(false)
        setInitialized(false)
      }
    }

    function teardownCache() {
      if (previousAddress.current) {
        closeCacheDB(previousAddress.current)
        previousAddress.current = null
      }
      resetCacheStore()
    }

    if (isConnected && walletAddress) {
      initCache(walletAddress.toLowerCase())
    } else {
      teardownCache()
    }

    // Cleanup on unmount
    return () => {
      closeAllCacheDBs()
    }
  }, [walletAddress, isConnected, setInitialized, setAvailable, resetCacheStore])

  // Handle page visibility changes
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.hidden) {
        // Page is hidden — no need to sync
        // Background sync will be handled in Sprint 3
      } else {
        // Page is visible again — trigger a sync if stale
        if (walletAddress && useCacheStore.getState().autoSyncEnabled) {
          const lastSync = useCacheStore.getState().lastSyncedAt
          const staleThreshold = 5 * 60 * 1000 // 5 minutes
          if (!lastSync || Date.now() - lastSync > staleThreshold) {
            // Trigger re-fetch (handled by React Query's refetchOnWindowFocus)
          }
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () =>
      document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [walletAddress])
}
