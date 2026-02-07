/**
 * Arkiv SDK Singleton Client
 * 
 * Provides a singleton instance of the Arkiv public client to ensure
 * only one client connection is maintained across the application.
 * This helps with connection pooling and reduces resource usage.
 */

import { type PublicArkivClient } from '@arkiv-network/sdk'
import { type Transport, type Chain } from 'viem'
import { createArkivClient } from './arkiv'

// Singleton instance storage
let arkivClient: PublicArkivClient<Transport, Chain | undefined, undefined> | null = null

/**
 * Get the singleton Arkiv SDK client instance.
 * 
 * Creates the client on first call, returns cached instance thereafter.
 * This ensures connection reuse and prevents multiple client instances.
 * 
 * @returns The singleton Arkiv public client instance
 * 
 * @example
 * ```typescript
 * // In any component or service
 * const client = getArkivClient()
 * const entity = await client.getEntity('0x123...')
 * ```
 */
export function getArkivClient(): PublicArkivClient<Transport, Chain | undefined, undefined> {
  if (!arkivClient) {
    arkivClient = createArkivClient()
  }
  return arkivClient
}

/**
 * Reset the singleton client instance.
 * 
 * Useful for testing or when you need to recreate the client
 * with different configuration (e.g., after environment changes).
 * 
 * @example
 * ```typescript
 * // Reset for testing
 * resetArkivClient()
 * const freshClient = getArkivClient()
 * ```
 */
export function resetArkivClient(): void {
  arkivClient = null
}

/**
 * Check if a singleton client instance exists.
 * 
 * @returns True if a client instance exists
 */
export function hasArkivClient(): boolean {
  return arkivClient !== null
}
