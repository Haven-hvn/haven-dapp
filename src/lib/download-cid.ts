/**
 * Filecoin Pin piece CID helpers for Synapse download.
 *
 * Uploads via filecoin-pin produce a **piece CID** (`bafkzcib…`) stored on Arkiv as
 * `piece_cid`. Haven retrieves encrypted CAR bytes only through
 * `synapse.storage.download({ pieceCid })`.
 *
 * @module lib/download-cid
 */

import type { Video } from '../types/video'
import { normalizeCid } from './ipfs'

/** Filecoin Piece CID (CommP) — `bafkzcib…` per FRC-0069 / filecoin-pin glossary. */
export function isFilecoinPieceCid(cid: string): boolean {
  const normalized = normalizeCid(cid)
  return normalized.startsWith('bafkzcib') && normalized.length >= 59
}

/**
 * Require a valid Filecoin piece CID on the video (Arkiv `piece_cid`).
 */
export function requirePieceCid(video: Video): string {
  const raw = video.pieceCid?.trim()
  if (!raw) {
    throw new Error(
      'Missing piece_cid on Arkiv. Re-upload with haven-cli so the entity stores the Filecoin Pin piece CID for Synapse download.'
    )
  }
  const cid = normalizeCid(raw)
  if (!isFilecoinPieceCid(cid)) {
    throw new Error(`Invalid piece_cid on Arkiv (expected bafkzcib…): ${raw}`)
  }
  return cid
}
