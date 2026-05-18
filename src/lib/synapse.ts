/**
 * Synapse SDK Utilities
 *
 * Client-side module for retrieving data from Filecoin Onchain Cloud
 * via the Synapse SDK (owner-aware URL resolution + `downloadAndValidate`).
 * Does not fall back to throwaway `storage.download` when `catalogOwner` is set.
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
  type resolvePieceUrl as ResolvePieceUrlTypes,
} from '@filoz/synapse-core/piece'
import {
  resolvePieceUrlSequential,
  type PieceUrlResolver,
} from './resolve-piece-url-sequential'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import {
  classifyRetrievalFailure,
  getSynapseErrorMessageForCode,
  type SynapseErrorCode,
} from './synapse-errors'

export type { SynapseErrorCode } from './synapse-errors'
export { classifyRetrievalFailure, getSynapseErrorMessageForCode } from './synapse-errors'

// ============================================================================
// Types
// ============================================================================

/** Browser: PDP first (CORS-friendly); server/CLI: FilBeam first. */
function getPieceUrlResolvers(): PieceUrlResolver[] {
  if (typeof window !== 'undefined') {
    return [chainResolver, filbeamResolver]
  }
  return [filbeamResolver, chainResolver]
}

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
  /** Abort in-flight resolution/download (e.g. user navigates away) */
  signal?: AbortSignal
}

export class SynapseError extends Error {
  constructor(
    message: string,
    public readonly code: SynapseErrorCode,
    public readonly pieceCid?: string
  ) {
    super(message)
    this.name = 'SynapseError'
  }
}

export function synapseErrorFromUnknown(
  error: unknown,
  pieceCid?: string
): SynapseError {
  if (error instanceof SynapseError) {
    return error
  }
  const message = error instanceof Error ? error.message : String(error)
  return new SynapseError(
    message,
    classifyRetrievalFailure(message),
    pieceCid
  )
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

  const cdnEnv =
    process.env.NEXT_PUBLIC_SYNAPSE_ENABLE_CDN ?? process.env.SYNAPSE_ENABLE_CDN

  synapseInstance = Synapse.create({
    account: privateKeyToAccount(key),
    source: 'haven-dapp',
    withCDN: cdnEnv == null || String(cdnEnv).trim().toLowerCase() !== 'false',
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
  catalogOwner: string,
  options?: Pick<SynapseDownloadOptions, 'withCDN' | 'signal'>
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
  const resolvers = getPieceUrlResolvers()

  const resolveAndDownload = async (
    activeResolvers: PieceUrlResolver[]
  ): Promise<Uint8Array> => {
    const url = await resolvePieceUrlSequential({
      address: owner,
      client: synapse.client,
      pieceCid: parsed,
      resolvers: activeResolvers,
      signal: options?.signal,
    })
    return downloadAndValidate({
      expectedPieceCid: parsed,
      url,
    })
  }

  try {
    return await resolveAndDownload(resolvers)
  } catch (firstError) {
    const firstMessage =
      firstError instanceof Error ? firstError.message : String(firstError)

    // If FilBeam was tried first and failed, force a PDP-only retry (browser path).
    const filbeamWasFirst = resolvers[0] === filbeamResolver
    const shouldRetryChainOnly =
      filbeamWasFirst &&
      (firstMessage.toLowerCase().includes('filbeam') ||
        firstMessage.includes('402') ||
        classifyRetrievalFailure(firstMessage) === 'NETWORK_ERROR')

    if (shouldRetryChainOnly) {
      try {
        return await resolveAndDownload([chainResolver])
      } catch (retryError) {
        throw synapseErrorFromUnknown(retryError, pieceCid)
      }
    }

    // FilBeam URL resolved but byte download failed (common with CORS) — retry via PDP.
    if (
      typeof window !== 'undefined' &&
      resolvers.includes(filbeamResolver) &&
      classifyRetrievalFailure(firstMessage) !== 'PIECE_NOT_FOUND'
    ) {
      try {
        return await resolveAndDownload([chainResolver])
      } catch {
        // fall through to primary error
      }
    }

    throw synapseErrorFromUnknown(firstError, pieceCid)
  }
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
 * against the uploader's FOC datasets before downloading. Never uses throwaway
 * `storage.download` for that path (wrong catalog address).
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
          options.catalogOwner,
          { signal: options.signal, withCDN: options.withCDN }
        )
      } catch (ownerError) {
        throw synapseErrorFromUnknown(ownerError, normalizedPieceCid)
      }
    }

    return await downloadViaStorageManager(synapse, normalizedPieceCid, options)
  } catch (error) {
    throw synapseErrorFromUnknown(error, normalizedPieceCid)
  }
}

const SYNAPSE_ERROR_TITLES: Record<SynapseErrorCode, string> = {
  INVALID_CID: 'Invalid Filecoin reference',
  INVALID_OWNER: 'Missing uploader address',
  PIECE_NOT_FOUND: 'Video not on Filecoin',
  STILL_PROPAGATING: 'Still storing on Filecoin',
  CDN_RAIL_MISMATCH: 'Upload needs CDN',
  NETWORK_ERROR: 'Connection problem',
  TIMEOUT: 'Download timed out',
  ABORTED: 'Cancelled',
  DOWNLOAD_FAILED: 'Could not load from Filecoin',
}

/**
 * Short title for player error overlay.
 */
export function getSynapseErrorTitle(code: SynapseErrorCode): string {
  return SYNAPSE_ERROR_TITLES[code]
}

/**
 * Get a user-friendly error message for a Synapse error.
 */
export function getSynapseErrorMessage(error: unknown): string {
  if (error instanceof SynapseError) {
    return getSynapseErrorMessageForCode(error.code)
  }

  if (error instanceof Error) {
    return getSynapseErrorMessageForCode(classifyRetrievalFailure(error.message))
  }

  return getSynapseErrorMessageForCode('DOWNLOAD_FAILED')
}
