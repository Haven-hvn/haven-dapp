/**
 * Resolve which CID to pass to Synapse for content download.
 *
 * Synapse `storage.download` requires a Filecoin **piece CID** (`baga…`).
 * Arkiv stores an encrypted **root** CID (`bafy…` / `Qm…`) in attributes;
 * decrypting it yields the root CID, which must not be used for Synapse fetch.
 *
 * @module lib/download-cid
 */

import type { Video } from '../types/video'
import { normalizeCid } from './ipfs'

/** Filecoin piece CIDs (CommP) used by Synapse storage.download. */
export function isPieceCid(cid: string): boolean {
  const normalized = normalizeCid(cid)
  return normalized.startsWith('baga')
}

/** IPFS / aggregate root CIDs — not valid for Synapse piece download. */
export function isRootIpfsCid(cid: string): boolean {
  const normalized = normalizeCid(cid)
  return (
    normalized.startsWith('bafy') ||
    normalized.startsWith('bafk') ||
    normalized.startsWith('bafz') ||
    normalized.startsWith('Qm')
  )
}

/**
 * CID to pass to Synapse when fetching encrypted or plain content bytes.
 *
 * @throws Error when only a root CID is available (legacy uploads without `piece_cid` on Arkiv)
 */
export function resolveSynapseDownloadCid(
  video: Video,
  decryptedRootCid?: string | null
): string {
  if (video.pieceCid && isPieceCid(video.pieceCid)) {
    return normalizeCid(video.pieceCid)
  }

  if (decryptedRootCid && isPieceCid(decryptedRootCid)) {
    return normalizeCid(decryptedRootCid)
  }

  if (video.filecoinCid && isPieceCid(video.filecoinCid)) {
    return normalizeCid(video.filecoinCid)
  }

  const rootHint = decryptedRootCid || video.filecoinCid
  if (rootHint && isRootIpfsCid(rootHint)) {
    throw new Error(
      'This video only has an IPFS root CID on Arkiv, not a Filecoin piece CID. ' +
        'Re-upload with the latest haven-cli (stores piece_cid in the payload) to play via Synapse.'
    )
  }

  throw new Error(
    'No Filecoin piece CID available for download. ' +
      'Ensure the video was uploaded with haven-cli and includes piece_cid in the Arkiv payload.'
  )
}
