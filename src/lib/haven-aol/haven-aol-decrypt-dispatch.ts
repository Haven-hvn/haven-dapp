/**
 * Haven-AOL — v1 / v3 decrypt dispatcher.
 *
 * Picks the right per-file decrypt path based on `metadata.version`:
 *   • `version === 1` → existing `decryptContentKey` (v1, byte-frozen).
 *   • `version === 3` → new `decryptContentKeyV3`.
 *
 * Callers that already know they hold a v1 record can keep calling
 * `decryptContentKey` directly (its signature is unchanged). Callers that
 * fetched a record of unknown version — community feed, single-video page —
 * should call `decryptAnyContentKey` here.
 *
 * @module lib/haven-aol/haven-aol-decrypt-dispatch
 */

import type { GateMetadataV3Json } from 'haven-aol'
import { decryptContentKey, type DecryptContentKeyResult } from './haven-aol-decrypt'
import {
  decryptContentKeyV3,
  type DecryptContentKeyV3Result,
} from './haven-aol-decrypt-v3'
import type { GateMetadataJson } from './haven-aol-metadata'
import type { WalletClientLike } from './haven-aol-auth'
import { HavenAolDecryptError } from './haven-aol-errors'

export interface DecryptAnyContentKeyOptions {
  encryptionMetadata: GateMetadataJson | GateMetadataV3Json
  encryptedCid?: string
  walletClient: WalletClientLike
  onProgress?: (message: string) => void
  signal?: AbortSignal
}

/** Common-shape result, either path lifts into this. */
export interface DecryptAnyContentKeyResult {
  aesKey: Uint8Array
  fromCache: boolean
  /** Which protocol version was used. */
  version: 1 | 3
  /** Whether the v3 gate-key cache supplied the upstream VetKey. Undefined for v1. */
  fromGateKeyCache?: boolean
}

/**
 * Decrypt the AES content key for ANY-version Haven-AOL metadata. Inspects
 * `metadata.version` and routes:
 *
 *   • `version === 1` → `decryptContentKey` (existing v1 path, untouched).
 *   • `version === 3` → `decryptContentKeyV3` (new v3 path).
 *   • anything else → `HavenAolDecryptError('METADATA_INVALID')`.
 *
 * Useful in the community feed / video-detail pages where the caller does
 * not know the version at compile time. Returns a unified result shape so
 * UI code is version-agnostic.
 */
export async function decryptAnyContentKey(
  options: DecryptAnyContentKeyOptions,
): Promise<DecryptAnyContentKeyResult> {
  const meta = options.encryptionMetadata
  if (!meta || typeof meta !== 'object') {
    throw new HavenAolDecryptError(
      'decryptAnyContentKey: encryptionMetadata is required',
      'METADATA_INVALID',
    )
  }

  if (meta.version === 1) {
    const result: DecryptContentKeyResult = await decryptContentKey({
      encryptionMetadata: meta,
      encryptedCid: options.encryptedCid,
      walletClient: options.walletClient,
      onProgress: options.onProgress,
      signal: options.signal,
    })
    return {
      aesKey: result.aesKey,
      fromCache: result.fromCache,
      version: 1,
    }
  }

  if (meta.version === 3) {
    const result: DecryptContentKeyV3Result = await decryptContentKeyV3({
      encryptionMetadata: meta,
      walletClient: options.walletClient,
      onProgress: options.onProgress,
      signal: options.signal,
    })
    return {
      aesKey: result.aesKey,
      fromCache: result.fromAesCache,
      version: 3,
      fromGateKeyCache: result.fromGateKeyCache,
    }
  }

  throw new HavenAolDecryptError(
    `Unsupported gate metadata version: ${String((meta as { version?: unknown }).version)}`,
    'METADATA_INVALID',
  )
}
