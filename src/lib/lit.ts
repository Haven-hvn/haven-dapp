/**
 * Lit Protocol Client for Haven Web DApp
 * 
 * Provides Lit Protocol SDK v8 initialization for browser-based decryption
 * of encrypted video content. Uses naga-dev network (free dev network).
 * 
 * @module lib/lit
 */

import { createLitClient } from '@lit-protocol/lit-client'
import { nagaDev } from '@lit-protocol/networks'
import { createAuthManager, storagePlugins } from '@lit-protocol/auth'
import type { NagaLitClient } from '@lit-protocol/lit-client'

// Global client instances
let litClient: NagaLitClient | null = null
let authManager: ReturnType<typeof createAuthManager> | null = null
let initPromise: Promise<NagaLitClient> | null = null

/**
 * Error thrown when Lit client operations fail.
 */
export class LitError extends Error {
  constructor(
    message: string,
    public code: 'INIT_FAILED' | 'NOT_INITIALIZED' | 'DISCONNECT_FAILED' | 'NETWORK_ERROR'
  ) {
    super(message)
    this.name = 'LitError'
  }
}

/**
 * Check if localStorage is available in the current environment.
 * Handles Safari private browsing mode and other restricted environments.
 */
function isLocalStorageAvailable(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  
  try {
    const testKey = '__lit_storage_test__'
    window.localStorage.setItem(testKey, 'test')
    window.localStorage.removeItem(testKey)
    return true
  } catch (e) {
    console.warn('[Lit] localStorage not available:', e)
    return false
  }
}

/**
 * Initialize Lit Protocol client for browser.
 * 
 * Uses the naga-dev network (free development network) for Lit Protocol.
 * Creates a singleton pattern to prevent multiple initializations.
 * 
 * @returns Promise resolving to the initialized LitClient
 * @throws LitError if initialization fails
 * 
 * @example
 * ```typescript
 * const client = await initLitClient()
 * console.log('Lit connected:', isLitConnected())
 * ```
 */
export async function initLitClient(): Promise<NagaLitClient> {
  // Return existing client if already initialized
  if (litClient && authManager) {
    return litClient
  }
  
  // Return existing promise if initialization is in progress
  if (initPromise) {
    return initPromise
  }
  
  initPromise = (async (): Promise<NagaLitClient> => {
    try {
      // Check for localStorage availability (required for auth caching)
      const storageAvailable = isLocalStorageAvailable()
      if (!storageAvailable) {
        console.warn('[Lit] localStorage not available - auth caching disabled')
      }
      
      // Create Lit client for naga-dev network (free dev network)
      litClient = await createLitClient({
        network: nagaDev,
      })
      
      // Initialize AuthManager with localStorage for browser
      // Falls back to memory storage if localStorage is unavailable
      authManager = createAuthManager({
        storage: storageAvailable 
          ? storagePlugins.localStorage({
              appName: 'haven-web',
              networkName: 'naga-dev',
            })
          : undefined as unknown as ReturnType<typeof storagePlugins.localStorage>,
      })
      
      console.log('[Lit] Connected to naga-dev network')
      return litClient
    } catch (error) {
      // Reset state on failure
      litClient = null
      authManager = null
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[Lit] Failed to initialize:', errorMessage)
      
      throw new LitError(
        `Failed to initialize Lit client: ${errorMessage}`,
        'INIT_FAILED'
      )
    } finally {
      initPromise = null
    }
  })()
  
  return initPromise
}

/**
 * Get the initialized Lit client.
 * 
 * @returns The initialized LitClient instance
 * @throws LitError if client is not initialized
 * 
 * @example
 * ```typescript
 * const client = getLitClient()
 * // Use client for encryption/decryption operations
 * ```
 */
export function getLitClient(): NagaLitClient {
  if (!litClient) {
    throw new LitError(
      'Lit client not initialized. Call initLitClient() first.',
      'NOT_INITIALIZED'
    )
  }
  return litClient
}

/**
 * Get the auth manager.
 * 
 * @returns The initialized auth manager instance
 * @throws LitError if auth manager is not initialized
 */
export function getAuthManager(): ReturnType<typeof createAuthManager> {
  if (!authManager) {
    throw new LitError(
      'Auth manager not initialized. Call initLitClient() first.',
      'NOT_INITIALIZED'
    )
  }
  return authManager
}

/**
 * Disconnect Lit client and clean up resources.
 * 
 * @returns Promise that resolves when disconnect is complete
 */
export async function disconnectLitClient(): Promise<void> {
  if (litClient) {
    try {
      await litClient.disconnect()
      console.log('[Lit] Disconnected from network')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.warn('[Lit] Error during disconnect:', errorMessage)
      // Don't throw - we still want to clean up state
    } finally {
      litClient = null
      authManager = null
      initPromise = null
    }
  }
}

/**
 * Check if Lit client is connected and ready to use.
 * 
 * @returns True if both client and auth manager are initialized
 */
export function isLitConnected(): boolean {
  return litClient !== null && authManager !== null
}

/**
 * Get the current network configuration.
 * 
 * @returns The network identifier (always 'naga-dev' for this implementation)
 */
export function getLitNetwork(): string {
  return 'naga-dev'
}

// Re-export types
export type { NagaLitClient as LitClient }
