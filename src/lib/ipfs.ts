/**
 * CID normalization and retrieval error types.
 *
 * Content bytes are fetched via Synapse (`piece_cid`), not HTTP IPFS gateways.
 *
 * @module lib/ipfs
 */

/**
 * Normalize a CID by removing `ipfs://` prefix and leading slashes.
 */
export function normalizeCid(cid: string): string {
  return cid.replace(/^ipfs:\/\//, '').replace(/^\//, '')
}

/**
 * Error thrown when content retrieval fails.
 */
export class IpfsError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cid?: string
  ) {
    super(message)
    this.name = 'IpfsError'
  }
}

/**
 * User-friendly message for retrieval errors.
 */
export function getIpfsErrorMessage(error: unknown): string {
  if (error instanceof IpfsError) {
    switch (error.code) {
      case 'INVALID_CID':
        return 'Invalid content identifier. Please check the video piece CID.'
      case 'FETCH_FAILED':
        return 'Failed to fetch video from storage. Please try again.'
      case 'TIMEOUT':
        return 'Request timed out. The network may be slow or unavailable.'
      case 'ALL_GATEWAYS_FAILED':
        return (
          'Could not download the video from Filecoin storage (Synapse). ' +
          'The piece may still be propagating after upload — wait a few minutes and try again. ' +
          'If this persists, re-upload with haven-cli and confirm the upload completed successfully.'
        )
      case 'ABORTED':
        return 'Request was cancelled.'
      default:
        return error.message || 'An unexpected storage error occurred.'
    }
  }

  if (error instanceof Error) {
    if (error.name === 'AbortError' || error.message.includes('aborted')) {
      return 'Request was cancelled.'
    }
    return error.message
  }

  return 'An unexpected error occurred while fetching content.'
}
