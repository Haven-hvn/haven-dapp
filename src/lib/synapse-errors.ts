/**
 * Classify raw Synapse / Filecoin retrieval failures for user-facing copy.
 *
 * @module lib/synapse-errors
 */

export type SynapseErrorCode =
  | 'INVALID_CID'
  | 'INVALID_OWNER'
  | 'PIECE_NOT_FOUND'
  | 'STILL_PROPAGATING'
  | 'CDN_RAIL_MISMATCH'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'ABORTED'
  | 'DOWNLOAD_FAILED'

/**
 * Map provider/SDK error text to a stable retrieval error code.
 */
export function classifyRetrievalFailure(raw: string): SynapseErrorCode {
  const m = raw.toLowerCase()

  if (m.includes('invalid piece cid') || m.includes('invalid piececid')) {
    return 'INVALID_CID'
  }
  if (m.includes('invalid catalog owner') || m.includes('invalid owner address')) {
    return 'INVALID_OWNER'
  }
  if (
    m.includes('402') ||
    m.includes('withcdn=false') ||
    m.includes('withcdn = false') ||
    m.includes('payment required')
  ) {
    return 'CDN_RAIL_MISMATCH'
  }
  if (
    m.includes('no provider found') ||
    m.includes('all provider retrieval') ||
    m.includes('promises rejected')
  ) {
    return 'PIECE_NOT_FOUND'
  }
  if (
    m.includes('propagat') ||
    m.includes('not yet available') ||
    m.includes('still being stored')
  ) {
    return 'STILL_PROPAGATING'
  }
  if (
    m.includes('cors') ||
    m.includes('failed to fetch') ||
    m.includes('networkerror') ||
    m.includes('network error') ||
    m.includes('load failed')
  ) {
    return 'NETWORK_ERROR'
  }
  if (m.includes('timeout') || m.includes('timed out')) {
    return 'TIMEOUT'
  }
  if (m.includes('abort') || m.includes('cancelled')) {
    return 'ABORTED'
  }

  return 'DOWNLOAD_FAILED'
}

const SYNAPSE_USER_MESSAGES: Record<SynapseErrorCode, string> = {
  INVALID_CID:
    'This video has an invalid Filecoin piece identifier. The Arkiv record may be corrupt — try re-uploading with haven-cli.',
  INVALID_OWNER:
    'This video is missing a valid uploader address, so Filecoin storage cannot be queried. Check the Arkiv entity or re-sync.',
  PIECE_NOT_FOUND:
    'The video file was not found on Filecoin for this uploader. The upload may have failed or the piece was never committed — re-upload with haven-cli and wait until the pipeline reports success.',
  STILL_PROPAGATING:
    'The video is still being stored on Filecoin after upload. Wait a few minutes, then try again.',
  CDN_RAIL_MISMATCH:
    'This video was stored without Filecoin CDN (an older upload). Re-upload with the current haven-cli so playback can use Filecoin Beam.',
  NETWORK_ERROR:
    'Your browser could not reach Filecoin storage. Check your internet connection, disable restrictive extensions, and try again.',
  TIMEOUT:
    'Downloading from Filecoin timed out. The network may be slow — try again in a minute.',
  ABORTED: 'Playback was cancelled.',
  DOWNLOAD_FAILED:
    'Could not download this video from Filecoin storage. Confirm the haven-cli upload finished successfully, then try again.',
}

export function getSynapseErrorMessageForCode(code: SynapseErrorCode): string {
  return SYNAPSE_USER_MESSAGES[code]
}
