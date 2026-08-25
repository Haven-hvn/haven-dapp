/**
 * V4 Filecoin upload — wallet-connected Synapse publishing.
 *
 * The read side of this dapp (`lib/synapse.ts`) uses a throwaway key because
 * downloads are free. Publishing is not: uploads require a funded Base
 * mainnet account paying USDFC storage fees. This module builds a
 * publisher-owned Synapse instance from the connected wallet's EIP-1193
 * provider and exposes a minimal store pipeline:
 *
 *   prepare → (wallet deposits USDFC if needed) → storage.upload → pieceCID
 *
 * @module lib/v4/synapse-upload
 */

import { Synapse } from '@filoz/synapse-sdk'
import { getChain as getSynapseChain } from '@filoz/synapse-core/chains'
import { custom, type Transport } from 'viem'

// ============================================================================
// Types
// ============================================================================

/** Minimal shape the dapp needs from wagmi/appkit wallet clients. */
export interface PublisherWalletLike {
  account: { address: string }
  /** EIP-1193 provider backing the wallet client (appkit/wagmi expose this). */
  transport?: unknown
}

export interface UploadPieceResult {
  /** Piece CID (string form) — stored as Arkiv `piece_cid`. */
  pieceCid: string
  /** Uploaded byte size. */
  size: number
}

export interface UploadProgress {
  phase: 'preparing' | 'uploading' | 'confirming'
  bytesUploaded?: number
  totalBytes?: number
}

export interface UploadPieceOptions {
  onProgress?: (progress: UploadProgress) => void
  signal?: AbortSignal
}

export class SynapseUploadError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'NO_PROVIDER'
      | 'WALLET_REJECTED'
      | 'INSUFFICIENT_FUNDS'
      | 'UPLOAD_FAILED',
    public readonly cause?: unknown
  ) {
    super(message)
    this.name = 'SynapseUploadError'
  }
}

// ============================================================================
// Instance management
// ============================================================================

let uploadSynapse: Synapse | null = null
let uploadSynapseAccount: string | null = null

/**
 * Create (or reuse) a publisher-owned Synapse instance.
 *
 * Uses the wallet's raw EIP-1193 transport so every transaction/signature is
 * approved by the user's own wallet — never a dapp-held key.
 */
export async function getUploadSynapse(
  wallet: PublisherWalletLike
): Promise<Synapse> {
  const address = wallet.account.address

  if (uploadSynapse && uploadSynapseAccount === address) {
    return uploadSynapse
  }

  const provider = extractEip1193Provider(wallet)
  if (!isEip1193Provider(provider)) {
    throw new SynapseUploadError(
      'Connected wallet did not expose an EIP-1193 provider for Filecoin uploads.',
      'NO_PROVIDER'
    )
  }

  const transport: Transport = custom(provider)

  try {
    uploadSynapse = await Synapse.create({
      transport,
      chain: getSynapseChain(BASE_MAINNET_CHAIN_ID),
      account: wallet.account.address as `0x${string}`,
      withCDN: true,
      source: 'haven-dapp-v4',
    })
    uploadSynapseAccount = address
    return uploadSynapse
  } catch (error) {
    throw new SynapseUploadError(
      `Failed to initialize Filecoin storage: ${errorMessage(error)}`,
      'UPLOAD_FAILED',
      error
    )
  }
}

/** Base mainnet — Filecoin Onchain Cloud runs here. */
const BASE_MAINNET_CHAIN_ID = 8453

interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>
}

function isEip1193Provider(value: unknown): value is Eip1193Provider {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { request?: unknown }).request === 'function'
  )
}

/** Reset the cached upload instance (wallet switch / tests). */
export function resetUploadSynapse(): void {
  uploadSynapse = null
  uploadSynapseAccount = null
}

function extractEip1193Provider(wallet: PublisherWalletLike): unknown {
  const transport = wallet.transport as
    | { provider?: unknown; value?: unknown }
    | undefined
  return transport?.provider ?? transport?.value ?? null
}

// ============================================================================
// Payment prep + upload
// ============================================================================

/**
 * Ensure the wallet has enough USDFC runway for `bytes`.
 *
 * `storage.prepare()` returns a deposit transaction when the current balance
 * plus buffer is insufficient; executing it prompts the wallet once. When no
 * deposit is needed it returns `{ transaction: null }` and we proceed silently.
 */
export async function ensureStorageRunway(
  synapse: Synapse,
  bytes: number
): Promise<void> {
  let prepared: Awaited<ReturnType<typeof synapse.storage.prepare>>
  try {
    prepared = await synapse.storage.prepare({ dataSize: BigInt(bytes) })
  } catch (error) {
    throw new SynapseUploadError(
      `Failed to quote storage costs: ${errorMessage(error)}`,
      'UPLOAD_FAILED',
      error
    )
  }

  if (!prepared.transaction) return

  try {
    await prepared.transaction.execute()
  } catch (error) {
    const msg = errorMessage(error)
    if (/user rejected|denied|rejected the request/i.test(msg)) {
      throw new SynapseUploadError('Deposit transaction was rejected.', 'WALLET_REJECTED', error)
    }
    throw new SynapseUploadError(
      `USDFC deposit failed: ${msg}. Fund your wallet and retry.`,
      'INSUFFICIENT_FUNDS',
      error
    )
  }
}

/**
 * Encrypt-and-pin handoff point: upload already-encrypted drip chunk bytes to
 * Filecoin Onchain Cloud and return the piece CID once confirmed.
 */
export async function uploadEncryptedPiece(
  synapse: Synapse,
  data: Uint8Array,
  options: UploadPieceOptions = {}
): Promise<UploadPieceResult> {
  options.onProgress?.({ phase: 'preparing', totalBytes: data.byteLength })
  await ensureStorageRunway(synapse, data.byteLength)

  try {
    options.onProgress?.({
      phase: 'uploading',
      bytesUploaded: 0,
      totalBytes: data.byteLength,
    })
    const result = await synapse.storage.upload(data, {
      signal: options.signal,
      callbacks: {
        onProgress: (uploaded: number) => {
          options.onProgress?.({
            phase: 'uploading',
            bytesUploaded: uploaded,
            totalBytes: data.byteLength,
          })
        },
        onStored: () => {
          options.onProgress?.({
            phase: 'confirming',
            bytesUploaded: data.byteLength,
            totalBytes: data.byteLength,
          })
        },
      },
    })

    if (!result?.pieceCid) {
      throw new Error('Synapse returned no piece CID')
    }

    options.onProgress?.({ phase: 'confirming', totalBytes: data.byteLength })
    return { pieceCid: result.pieceCid.toString(), size: result.size ?? data.byteLength }
  } catch (error) {
    if (options.signal?.aborted) {
      throw new DOMException('Upload cancelled', 'AbortError')
    }
    const msg = errorMessage(error)
    if (/user rejected|denied/i.test(msg)) {
      throw new SynapseUploadError('Upload transaction was rejected.', 'WALLET_REJECTED', error)
    }
    throw new SynapseUploadError(`Filecoin upload failed: ${msg}`, 'UPLOAD_FAILED', error)
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
