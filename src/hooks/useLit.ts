/**
 * React Hook for Lit Protocol
 * 
 * Provides a React hook for managing Lit Protocol client state,
 * including initialization, connection status, and error handling.
 * 
 * @module hooks/useLit
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { 
  initLitClient, 
  disconnectLitClient, 
  isLitConnected
} from '@/lib/lit'

/**
 * Return type for the useLit hook.
 */
export interface UseLitReturn {
  /** Whether the Lit client is initialized and ready */
  isInitialized: boolean
  
  /** Whether initialization is in progress */
  isInitializing: boolean
  
  /** Error from the last initialization attempt */
  error: Error | null
  
  /** Initialize the Lit client */
  initialize: () => Promise<void>
  
  /** Disconnect and cleanup the Lit client */
  disconnect: () => Promise<void>
  
  /** Reinitialize the Lit client (disconnect then initialize) */
  reinitialize: () => Promise<void>
}

/**
 * React hook for managing Lit Protocol client.
 * 
 * Provides state management and callbacks for Lit Protocol initialization,
 * with automatic state tracking and error handling.
 * 
 * @returns Object containing initialization state and control functions
 * 
 * @example
 * ```typescript
 * function MyComponent() {
 *   const { isInitialized, isInitializing, error, initialize } = useLit()
 *   
 *   useEffect(() => {
 *     if (!isInitialized) {
 *       initialize()
 *     }
 *   }, [isInitialized, initialize])
 *   
 *   if (isInitializing) return <Loading />
 *   if (error) return <Error message={error.message} />
 *   
 *   return <div>Lit Connected!</div>
 * }
 * ```
 */
export function useLit(): UseLitReturn {
  const [isInitialized, setIsInitialized] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  
  // Use ref to track mounted state and prevent state updates after unmount
  const isMountedRef = useRef(true)
  
  useEffect(() => {
    // Check initial state on mount
    setIsInitialized(isLitConnected())
    
    return () => {
      isMountedRef.current = false
    }
  }, [])
  
  /**
   * Initialize the Lit Protocol client.
   */
  const initialize = useCallback(async (): Promise<void> => {
    // Skip if already initialized
    if (isLitConnected()) {
      if (isMountedRef.current) {
        setIsInitialized(true)
        setError(null)
      }
      return
    }
    
    // Skip if already initializing
    if (isInitializing) {
      return
    }
    
    if (isMountedRef.current) {
      setIsInitializing(true)
      setError(null)
    }
    
    try {
      await initLitClient()
      
      if (isMountedRef.current) {
        setIsInitialized(true)
        setError(null)
      }
    } catch (err) {
      console.error('[useLit] Initialization failed:', err)
      
      if (isMountedRef.current) {
        setError(err instanceof Error ? err : new Error('Failed to initialize Lit'))
        setIsInitialized(false)
      }
    } finally {
      if (isMountedRef.current) {
        setIsInitializing(false)
      }
    }
  }, [isInitializing])
  
  /**
   * Disconnect the Lit Protocol client.
   */
  const disconnect = useCallback(async (): Promise<void> => {
    try {
      await disconnectLitClient()
    } catch (err) {
      console.warn('[useLit] Disconnect error:', err)
    } finally {
      if (isMountedRef.current) {
        setIsInitialized(false)
      }
    }
  }, [])
  
  /**
   * Reinitialize the Lit Protocol client.
   * Useful for recovering from errors.
   */
  const reinitialize = useCallback(async (): Promise<void> => {
    await disconnect()
    await initialize()
  }, [disconnect, initialize])
  
  return {
    isInitialized,
    isInitializing,
    error,
    initialize,
    disconnect,
    reinitialize,
  }
}

/**
 * React hook for Lit Protocol with automatic initialization.
 * 
 * Similar to useLit but automatically initializes on mount.
 * Useful for components that always need Lit to be available.
 * 
 * @param enabled - Whether to enable auto-initialization (default: true)
 * @returns Object containing initialization state and control functions
 * 
 * @example
 * ```typescript
 * function VideoPlayer() {
 *   const { isInitialized, isInitializing, error } = useLitAutoInit()
 *   
 *   if (isInitializing) return <Loading />
 *   if (error) return <Error message={error.message} />
 *   if (!isInitialized) return <NotConnected />
 *   
 *   return <VideoStream />
 * }
 * ```
 */
export function useLitAutoInit(enabled: boolean = true): UseLitReturn {
  const lit = useLit()
  
  useEffect(() => {
    if (enabled && !lit.isInitialized && !lit.isInitializing) {
      lit.initialize()
    }
  }, [enabled, lit.isInitialized, lit.isInitializing, lit.initialize])
  
  return lit
}
