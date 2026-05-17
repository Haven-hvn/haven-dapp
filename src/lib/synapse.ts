/**
 * Synapse SDK Utilities
 *
 * Client-side module for retrieving data from Filecoin Onchain Cloud
 * via the Synapse SDK (owner-aware `resolvePieceUrl` + `downloadAndValidate`,
 * with optional direct `storage.download` fallback).
 *
 * No private key or funded wallet is required — the SDK auto-generates
 * a throwaway key for initialization. Downloads of public data are free.
 *
 * @module lib/synapse
 */

import { Synapse } from '@filoz/synapse-sdk'
import {
  asPieceCID,
  chainResolver,
  downloadAndValidate,
  filbeamResolver,
  resolvePieceUrl,
} from '@filoz/synapse-core/piece'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'

// ============================================================================
// Types
// ============================================================================

export interface SynapseConfig {
  /** Enable CDN for faster retrieval */
  withCDN?: boolean
}

export interface SynapseDownloadOptions {
  /**
   * Arkiv entity owner (uploader wallet). Used for `resolvePieceUrl` so FOC
   * dataset discovery targets the uploader, not the throwaway SDK account.
   */
  catalogOwner?: string
  /** Optional SP address — skips resolver chain when known */
  providerAddress?: `0x${string}`
  /** Override CDN for this download */
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

type SynapseInstance = Awaited<ReturnType<typeof Synapse.create>>

// ============================================================================
// Singleton Instance
// ============================================================================

let synapseInstance: SynapseInstance | null = null

/**
 * Get or create the Synapse SDK singleton instance.
 *
 * Uses a throwaway generated key for SDK initialization since downloads
 * of public data don't require a funded wallet. The account is only needed
 * to bootstrap the SDK's provider discovery.
 *
 * @returns Synapse SDK instance
 */
export function getSynapseInstance(): SynapseInstance {
  if (synapseInstance) {
    return synapseInstance
  }

  const key = generatePrivateKey()

  synapseInstance = Synapse.create({
    account: privateKeyToAccount(key),
    source: 'haven-dapp',
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

const OWNER_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

function normalizeCatalogOwner(address: string): `0x${string}` {
  const trimmed = address.trim()
  if (!OWNER_ADDRESS_RE.test(trimmed)) {
    throw new SynapseError(
      `Invalid catalog owner address: ${address}`,
      'INVALID_OWNER'
    )
  }
  return trimmed.toLowerCase() as `0x${string}`
}

async function downloadForCatalogOwner(
  synapse: SynapseInstance,
  pieceCid: string,
  catalogOwner: string
): Promise<Uint8Array> {
  const parsed = asPieceCID(pieceCid)
  if (parsed == null) {
    throw new SynapseError(
      `Invalid piece CID: ${pieceCid}`,
      'INVALID_CID',
      pieceCid
    )
  }

  const owner = normalizeCatalogOwner(catalogOwner)
  const url = await resolvePieceUrl({
    address: owner,
    client: synapse.client,
    pieceCid: parsed,
    resolvers: [filbeamResolver, chainResolver],
  })

  return downloadAndValidate({
    expectedPieceCid: parsed,
    url,
  })
}

async function downloadViaStorageManager(
  synapse: SynapseInstance,
  pieceCid: string,
  options?: Pick<SynapseDownloadOptions, 'providerAddress' | 'withCDN'>
): Promise<Uint8Array> {
  const bytes = await synapse.storage.download({
    pieceCid,
    ...(options?.providerAddress != null
      ? { providerAddress: options.providerAddress }
      : {}),
    ...(options?.withCDN != null ? { withCDN: options.withCDN } : {}),
  })
  return new Uint8Array(bytes)
}

/**
 * Download data from Filecoin via Synapse SDK using a piece CID.
 *
 * When `catalogOwner` is set (Arkiv entity owner), resolves the piece URL
 * against the uploader's FOC datasets before downloading. Falls back to
 * `storage.download` only if owner-aware resolution fails.
 *
 * @param pieceCid - The piece CID (content identifier) to download
 * @param options - Optional owner address and provider hints
 * @returns Downloaded data as Uint8Array
 * @throws SynapseError on download failure
 */
export async function downloadFromSynapse(
  pieceCid: string,
  options?: SynapseDownloadOptions
): Promise<Uint8Array> {
  if (!pieceCid || typeof pieceCid !== 'string' || pieceCid.trim().length === 0) {
    throw new SynapseError(
      `Invalid piece CID: ${pieceCid}`,
      'INVALID_CID',
      pieceCid
    )
  }

  const normalizedPieceCid = pieceCid.trim()

  try {
    const synapse = getSynapseInstance()

    if (options?.providerAddress != null) {
      return await downloadViaStorageManager(synapse, normalizedPieceCid, options)
    }

    if (options?.catalogOwner != null && options.catalogOwner.trim().length > 0) {
      try {
        return await downloadForCatalogOwner(
          synapse,
          normalizedPieceCid,
          options.catalogOwner
        )
      } catch (ownerError) {
        if (ownerError instanceof SynapseError) {
          throw ownerError
        }
        console.warn(
          '[synapse] Owner-aware resolution failed, falling back to storage.download:',
          ownerError instanceof Error ? ownerError.message : ownerError,
          { pieceCid: normalizedPieceCid, catalogOwner: options.catalogOwner.trim() }
        )
      }
    }

    return await downloadViaStorageManager(synapse, normalizedPieceCid, options)
  } catch (error) {
    if (error instanceof SynapseError) {
      throw error
    }

    const message = error instanceof Error ? error.message : String(error)
    throw new SynapseError(
      `Failed to download from Synapse: ${message}`,
      'DOWNLOAD_FAILED',
      normalizedPieceCid
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
      case 'INVALID_OWNER':
        return 'Invalid video owner address for Filecoin retrieval.'
      case 'DOWNLOAD_FAILED':
        return (
          'Could not download the video from Filecoin storage (Synapse). ' +
          'The piece may still be propagating after upload — wait a few minutes and try again. ' +
          'If this persists, re-upload with haven-cli and confirm the upload completed successfully.'
        )
      default:
        return error.message || 'An unexpected Synapse error occurred.'
    }
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'An unexpected error occurred during content retrieval.'
}
