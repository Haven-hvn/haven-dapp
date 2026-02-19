/**
 * Synapse SDK Utilities
 * 
 * Client-side module for retrieving data from Filecoin Onchain Cloud
 * via the Synapse SDK. Provides download functionality as a replacement
 * for direct IPFS HTTP gateway fetching.
 * 
 * No private key or funded wallet is required — the SDK auto-generates
 * a throwaway key for initialization. Downloads of public data are free.
 * 
 * @module lib/synapse
 */

import { Synapse } from '@filoz/synapse-sdk'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'

// ============================================================================
// Types
// ============================================================================

export interface SynapseConfig {
  /** Enable CDN for faster retrieval */
  withCDN?: boolean
}

export class SynapseError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly pieceCid?: string
  ) {
    super(message)
    this.name = 'SynapseError'
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let synapseInstance: ReturnType<typeof Synapse.create> | null = null

/**
 * Get or create the Synapse SDK singleton instance.
 * 
 * Uses a throwaway generated key for SDK initialization since downloads
 * of public data don't require a funded wallet. The account is only needed
 * to bootstrap the SDK's provider discovery.
 * 
 * @returns Synapse SDK instance
 */
export function getSynapseInstance(): ReturnType<typeof Synapse.create> {
  if (synapseInstance) {
    return synapseInstance
  }

  // Generate a throwaway key for SDK initialization.
  // Downloads of public data don't require a funded wallet —
  // the account is only needed to bootstrap the SDK.
  const key = generatePrivateKey()

  synapseInstance = Synapse.create({
    account: privateKeyToAccount(key),
    withCDN: typeof window === 'undefined'
      ? process.env.SYNAPSE_ENABLE_CDN === 'true'
      : false,
  })

  return synapseInstance
}

/**
 * Reset the Synapse SDK instance.
 * Useful for testing or reconfiguration.
 */
export function resetSynapseInstance(): void {
  synapseInstance = null
}

// ============================================================================
// Download Functions
// ============================================================================

/**
 * Download data from Filecoin via Synapse SDK using a piece CID.
 * 
 * This runs directly in the browser — no server-side proxy needed.
 * 
 * @param pieceCid - The piece CID (content identifier) to download
 * @returns Downloaded data as Uint8Array
 * @throws SynapseError on download failure
 * 
 * @example
 * ```typescript
 * const data = await downloadFromSynapse('baga6ea4seaq...')
 * console.log(`Downloaded ${data.byteLength} bytes`)
 * ```
 */
export async function downloadFromSynapse(pieceCid: string): Promise<Uint8Array> {
  if (!pieceCid || typeof pieceCid !== 'string' || pieceCid.trim().length === 0) {
    throw new SynapseError(
      `Invalid piece CID: ${pieceCid}`,
      'INVALID_CID',
      pieceCid
    )
  }

  try {
    const synapse = getSynapseInstance()
    const bytes = await synapse.storage.download({ pieceCid })
    return new Uint8Array(bytes)
  } catch (error) {
    // Re-throw SynapseErrors as-is
    if (error instanceof SynapseError) {
      throw error
    }

    const message = error instanceof Error ? error.message : String(error)
    throw new SynapseError(
      `Failed to download from Synapse: ${message}`,
      'DOWNLOAD_FAILED',
      pieceCid
    )
  }
}

/**
 * Get a user-friendly error message for a Synapse error.
 * 
 * @param error - The error to get a message for
 * @returns User-friendly error message
 */
export function getSynapseErrorMessage(error: unknown): string {
  if (error instanceof SynapseError) {
    switch (error.code) {
      case 'INVALID_CID':
        return 'Invalid content identifier provided.'
      case 'DOWNLOAD_FAILED':
        return 'Failed to retrieve content from Filecoin. Please try again.'
      default:
        return error.message || 'An unexpected Synapse error occurred.'
    }
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'An unexpected error occurred during content retrieval.'
}