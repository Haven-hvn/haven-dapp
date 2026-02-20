/**
 * useBackgroundSync Hook
 *
 * React hook that manages the cache sync engine lifecycle.
 * Automatically starts/stops the background sync engine based on:
 * - Wallet connection status
 * - Cache initialization state
 * - Auto-sync user preference
 *
 * Usage:
 * ```tsx
 * // Mount once at the app root level
 * function App() {
 *   useBackgroundSync()
 *   return <AppContent />
 * }
 * ```
 */

'use client'

import { useEffect, useRef } from 'react'
import { useAppKitAccount } from '@reown/appkit/react'
import { useCacheStore } from '../stores/cacheStore'
import { CacheSyncEngine, getSyncEngine } from '../lib/cache/syncEngine'

// ── Return Types ───────────────────────────────────────────────────

/**
 * Return type for useBackgroundSync hook.
 * This hook returns void, but we define a type for consistency.
 */
export type UseBackgroundSyncReturn = void

/**
 * Return type for useManualSync hook.
 */
export interface UseManualSyncReturn {
  /** Trigger a manual sync */
  sync: () => Promise<void>
  /** Whether a sync is in progress */
  isSyncing: boolean
  /** Last successful sync timestamp */
  lastSyncedAt: number | null
  /** Error from last sync attempt */
  lastSyncError: string | null
}

/**
 * Return type for useSyncEngineStatus hook.
 */
export interface UseSyncEngineStatusReturn {
  /** Whether the sync engine is active */
  active: boolean
  /** Whether a sync is currently running */
  syncing: boolean
  /** Whether auto-sync is enabled */
  autoSyncEnabled: boolean
}

/**
 * Hook that manages the background sync engine lifecycle.
 *
 * Features:
 * - Starts sync engine when wallet is connected and cache is initialized
 * - Stops sync engine on wallet disconnect
 * - Respects auto-sync user preference
 * - Prevents duplicate engines via singleton management
 *
 * This hook should be mounted once at the app root level.
 *
 * @returns void
 */
export function useBackgroundSync(): UseBackgroundSyncReturn {
  const { address, isConnected } = useAppKitAccount()
  const { autoSyncEnabled, isInitialized } = useCacheStore()
  const engineRef = useRef<CacheSyncEngine | null>(null)

  useEffect(() => {
    // Only start sync when cache is initialized and auto-sync is enabled
    if (!isConnected || !address || !isInitialized || !autoSyncEnabled) {
      // Stop any running engine
      if (engineRef.current) {
        engineRef.current.stop()
        engineRef.current = null
      }
      return
    }

    // Get or create engine (singleton pattern)
    const normalizedAddress = address.toLowerCase()
    const engine = getSyncEngine(normalizedAddress)

    // Start the engine if not already running
    if (!engine.active) {
      engine.start()
    }

    engineRef.current = engine

    // Cleanup on unmount or when conditions change
    return () => {
      engine.stop()
      engineRef.current = null
    }
  }, [address, isConnected, isInitialized, autoSyncEnabled])
}

/**
 * Hook that provides manual sync control.
 *
 * Features:
 * - Manual sync trigger
 * - Sync status monitoring
 * - Last sync time tracking
 *
 * @returns Object with sync controls and status
 */
export function useManualSync(): UseManualSyncReturn {
  const { address, isConnected } = useAppKitAccount()
  const { isSyncing, lastSyncedAt, lastSyncError, isInitialized } = useCacheStore()

  const sync = async (): Promise<void> => {
    if (!isConnected || !address || !isInitialized) {
      console.warn('[useManualSync] Cannot sync: wallet not connected or cache not initialized')
      return
    }

    const engine = getSyncEngine(address.toLowerCase())
    await engine.syncOnce()
  }

  return {
    sync,
    isSyncing,
    lastSyncedAt,
    lastSyncError,
  }
}

/**
 * Hook that provides sync engine status for debugging/monitoring.
 *
 * @returns Object with engine status information
 */
export function useSyncEngineStatus(): UseSyncEngineStatusReturn {
  const { address, isConnected } = useAppKitAccount()
  const { autoSyncEnabled, isSyncing, isInitialized } = useCacheStore()

  // Engine is considered active when all conditions are met
  const active = isConnected && !!address && isInitialized && autoSyncEnabled

  return {
    active,
    syncing: isSyncing,
    autoSyncEnabled,
  }
}
