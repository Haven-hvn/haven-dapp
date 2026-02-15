'use client'

/**
 * Arkiv SDK React Hooks
 * 
 * Provides React hooks for interacting with the Arkiv blockchain storage.
 * Integrates with wagmi for wallet address management.
 * 
 * Uses @arkiv-network/sdk v0.5.3 for all Arkiv operations.
 * 
 * @module useArkivClient
 */

import { useAppKitAccount } from '@reown/appkit/react'
import { useState, useEffect, useCallback, useRef } from 'react'
import { type PublicArkivClient } from '@arkiv-network/sdk'
import { type Transport, type Chain } from 'viem'
import {
  createArkivClient,
  queryEntitiesByOwner,
  getEntity,
  getAllEntitiesByOwner,
  checkArkivConnection,
  ArkivError,
  type ArkivEntity,
  type ArkivQueryOptions,
  type ArkivConnectionStatus,
} from '@/lib/arkiv'

// ============================================================================
// Hook State Types
// ============================================================================

/**
 * State for entity queries
 */
interface QueryState {
  /** Whether a query is in progress */
  isLoading: boolean
  
  /** Error from last query */
  error: ArkivError | Error | null
  
  /** Last successful query results */
  entities: ArkivEntity[]
  
  /** Whether there are more results available */
  hasMore: boolean
  
  /** Cursor for pagination */
  nextCursor?: string
}

/**
 * State for connection management
 */
interface ConnectionState {
  /** Whether the client is initialized and ready */
  isReady: boolean
  
  /** Current connection status */
  status: ArkivConnectionStatus
  
  /** Whether connection check is in progress */
  isChecking: boolean
}

// ============================================================================
// Hook Options
// ============================================================================

interface UseArkivClientOptions {
  /** 
   * Whether to auto-initialize the client on mount
   * @default true
   */
  autoInitialize?: boolean
  
  /**
   * Whether to check connection status on mount
   * @default true
   */
  checkConnectionOnMount?: boolean
  
  /**
   * Interval in ms to recheck connection (0 to disable)
   * @default 30000 (30 seconds)
   */
  connectionCheckInterval?: number
}

// ============================================================================
// Main Hook
// ============================================================================

/**
 * React hook for Arkiv client interactions
 * 
 * This hook provides a React interface for the Arkiv SDK, handling
 * client initialization, connection monitoring, and entity queries.
 * 
 * @param options - Hook configuration options
 * @returns Hook state and methods for Arkiv operations
 * 
 * @example
 * ```tsx
 * function VideoLibrary() {
 *   const { 
 *     client, 
 *     isReady, 
 *     entities, 
 *     isLoading, 
 *     queryEntities,
 *     refresh 
 *   } = useArkivClient()
 *   
 *   useEffect(() => {
 *     if (isReady) {
 *       queryEntities()
 *     }
 *   }, [isReady])
 *   
 *   if (isLoading) return <div>Loading...</div>
 *   
 *   return (
 *     <div>
 *       {entities.map(entity => (
 *         <VideoCard key={entity.key} entity={entity} />
 *       ))}
 *     </div>
 *   )
 * }
 * ```
 */
export function useArkivClient(options: UseArkivClientOptions = {}) {
  const {
    autoInitialize = true,
    checkConnectionOnMount = true,
    connectionCheckInterval = 30000,
  } = options
  
  // Get wallet state from AppKit
  const { address, isConnected } = useAppKitAccount()
  
  // Client instance
  const [client, setClient] = useState<PublicArkivClient<Transport, Chain | undefined, undefined> | null>(null)
  
  // Connection state
  const [connection, setConnection] = useState<ConnectionState>({
    isReady: false,
    status: { isConnected: false },
    isChecking: false,
  })
  
  // Query state
  const [query, setQuery] = useState<QueryState>({
    isLoading: false,
    error: null,
    entities: [],
    hasMore: false,
  })
  
  // Refs for managing async operations
  const abortControllerRef = useRef<AbortController | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  
  // ============================================================================
  // Client Initialization
  // ============================================================================
  
  /**
   * Initialize the Arkiv client on mount
   */
  useEffect(() => {
    if (autoInitialize) {
      try {
        const newClient = createArkivClient()
        setClient(newClient)
        setConnection(prev => ({
          ...prev,
          isReady: true,
        }))
      } catch (error) {
        console.error('Failed to initialize Arkiv client:', error)
        setConnection(prev => ({
          ...prev,
          isReady: false,
          status: {
            isConnected: false,
            error: error instanceof Error ? error.message : 'Initialization failed',
          },
        }))
      }
    }
    
    // Cleanup
    return () => {
      setClient(null)
      setConnection({
        isReady: false,
        status: { isConnected: false },
        isChecking: false,
      })
    }
  }, [autoInitialize])
  
  // ============================================================================
  // Connection Monitoring
  // ============================================================================
  
  /**
   * Check connection status
   */
  const checkConnection = useCallback(async (): Promise<ArkivConnectionStatus> => {
    setConnection(prev => ({ ...prev, isChecking: true }))
    
    try {
      const status = await checkArkivConnection()
      
      setConnection(prev => ({
        ...prev,
        status,
        isChecking: false,
      }))
      
      return status
    } catch (error) {
      const errorStatus: ArkivConnectionStatus = {
        isConnected: false,
        error: error instanceof Error ? error.message : 'Connection check failed',
      }
      
      setConnection(prev => ({
        ...prev,
        status: errorStatus,
        isChecking: false,
      }))
      
      return errorStatus
    }
  }, [])
  
  /**
   * Check connection on mount
   */
  useEffect(() => {
    if (checkConnectionOnMount && autoInitialize) {
      checkConnection()
    }
  }, [checkConnectionOnMount, autoInitialize, checkConnection])
  
  /**
   * Set up periodic connection check
   */
  useEffect(() => {
    if (connectionCheckInterval > 0 && autoInitialize) {
      intervalRef.current = setInterval(() => {
        checkConnection()
      }, connectionCheckInterval)
    }
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [connectionCheckInterval, checkConnection, autoInitialize])
  
  // ============================================================================
  // Query Operations
  // ============================================================================
  
  /**
   * Query entities for the connected wallet
   * 
   * @param queryOptions - Query options for filtering and pagination
   * @param append - Whether to append results to existing entities (for pagination)
   */
  const queryEntities = useCallback(async (
    queryOptions?: Omit<ArkivQueryOptions, 'query'>,
    append: boolean = false
  ): Promise<ArkivEntity[]> => {
    if (!client || !connection.isReady) {
      throw new ArkivError('Client not initialized', 'NOT_INITIALIZED')
    }
    
    if (!address) {
      throw new ArkivError('No wallet address available', 'NO_ADDRESS')
    }
    
    // Cancel any in-flight requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()
    
    setQuery(prev => ({
      ...prev,
      isLoading: true,
      error: null,
    }))
    
    try {
      const results = await queryEntitiesByOwner(client, address, queryOptions)
      
      setQuery(prev => ({
        isLoading: false,
        error: null,
        entities: append ? [...prev.entities, ...results] : results,
        hasMore: results.length === (queryOptions?.maxResults || 50),
      }))
      
      return results
    } catch (error) {
      const arkivError = error instanceof ArkivError
        ? error
        : new ArkivError(
            error instanceof Error ? error.message : 'Query failed',
            'QUERY_ERROR'
          )
      
      setQuery(prev => ({
        ...prev,
        isLoading: false,
        error: arkivError,
      }))
      
      throw arkivError
    }
  }, [client, connection.isReady, address])
  
  /**
   * Refresh entities (reload from first page)
   */
  const refresh = useCallback(async (): Promise<ArkivEntity[]> => {
    return queryEntities({}, false)
  }, [queryEntities])
  
  /**
   * Get all entities for the connected wallet (handles pagination)
   */
  const getAllEntities = useCallback(async (maxResults?: number): Promise<ArkivEntity[]> => {
    if (!client || !connection.isReady) {
      throw new ArkivError('Client not initialized', 'NOT_INITIALIZED')
    }
    
    if (!address) {
      throw new ArkivError('No wallet address available', 'NO_ADDRESS')
    }
    
    setQuery(prev => ({
      ...prev,
      isLoading: true,
      error: null,
    }))
    
    try {
      const entities = await getAllEntitiesByOwner(client, address, maxResults)
      
      setQuery(() => ({
        isLoading: false,
        error: null,
        entities,
        hasMore: false,
      }))
      
      return entities
    } catch (error) {
      const arkivError = error instanceof ArkivError
        ? error
        : new ArkivError(
            error instanceof Error ? error.message : 'Failed to load all entities',
            'FETCH_ALL_ERROR'
          )
      
      setQuery(prev => ({
        ...prev,
        isLoading: false,
        error: arkivError,
      }))
      
      throw arkivError
    }
  }, [client, connection.isReady, address])
  
  /**
   * Get a specific entity by key
   */
  const getEntityByKey = useCallback(async (entityKey: string): Promise<ArkivEntity | null> => {
    if (!client || !connection.isReady) {
      throw new ArkivError('Client not initialized', 'NOT_INITIALIZED')
    }
    
    return getEntity(client, entityKey)
  }, [client, connection.isReady])
  
  // ============================================================================
  // Cleanup
  // ============================================================================
  
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [])
  
  // ============================================================================
  // Return Value
  // ============================================================================
  
  return {
    // Client instance
    client,
    
    // Connection state
    isReady: connection.isReady,
    isConnected: connection.status.isConnected,
    connectionStatus: connection.status,
    isCheckingConnection: connection.isChecking,
    
    // Query state
    entities: query.entities,
    isLoading: query.isLoading,
    error: query.error,
    hasMore: query.hasMore,
    
    // Wallet info
    address,
    isWalletConnected: isConnected,
    
    // Methods
    queryEntities,
    refresh,
    getAllEntities,
    getEntity: getEntityByKey,
    checkConnection,
  }
}

// ============================================================================
// Additional Hooks
// ============================================================================

/**
 * Hook for simple entity list (auto-fetches when wallet connects)
 * 
 * @param maxResults - Maximum results to fetch
 * @returns Entities and loading state
 * 
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { entities, isLoading, error, refresh } = useArkivEntities(100)
 *   // entities auto-fetches when wallet is connected
 * }
 * ```
 */
export function useArkivEntities(maxResults?: number) {
  const {
    entities,
    isLoading,
    error,
    isReady,
    isWalletConnected,
    getAllEntities,
    refresh,
  } = useArkivClient()
  
  useEffect(() => {
    if (isReady && isWalletConnected && entities.length === 0) {
      getAllEntities(maxResults)
    }
  }, [isReady, isWalletConnected, entities.length, getAllEntities, maxResults])
  
  return { entities, isLoading, error, refresh }
}

/**
 * Hook for querying entities by the connected wallet's address.
 * 
 * This is the primary hook for fetching entities owned by the connected wallet.
 * It automatically fetches entities when the wallet connects and the client is ready.
 * 
 * @returns Entity query state and refetch function
 * 
 * @example
 * ```tsx
 * function VideoLibrary() {
 *   const { entities, isLoading, error, refetch } = useArkivQuery()
 *   
 *   if (isLoading) return <Spinner />
 *   if (error) return <Error message={error.message} />
 *   
 *   return (
 *     <div>
 *       {entities.map(entity => (
 *         <VideoCard key={entity.key} entity={entity} />
 *       ))}
 *     </div>
 *   )
 * }
 * ```
 */
export function useArkivQuery() {
  const { 
    address, 
    isConnected,
    entities,
    isLoading,
    error,
    isReady,
    getAllEntities,
  } = useArkivClient()
  
  // Auto-fetch when wallet connects and client is ready
  useEffect(() => {
    if (isConnected && isReady && address) {
      getAllEntities()
    }
  }, [isConnected, isReady, address, getAllEntities])
  
  return {
    entities,
    isLoading,
    error,
    refetch: getAllEntities,
  }
}

// Re-export types
export type { ArkivEntity, ArkivQueryOptions, ArkivConnectionStatus }
