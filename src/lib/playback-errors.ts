/**
 * User-facing errors for encrypted video playback (retrieval + decrypt).
 *
 * Retrieval (Synapse) runs before any wallet signature. Map those errors first.
 *
 * @module lib/playback-errors
 */

import { EncryptedPayloadError } from './encrypted-payload'
import { getHavenAolErrorMessage, HavenAolDecryptError } from './haven-aol/haven-aol-errors'
import { IpfsError, getIpfsErrorMessage } from './ipfs'
import {
  SynapseError,
  getSynapseErrorMessage,
  getSynapseErrorTitle,
} from './synapse'

export type PlaybackErrorCategory =
  | 'storage'
  | 'wallet'
  | 'decryption'
  | 'cancelled'
  | 'size'
  | 'unknown'

export interface PlaybackErrorPresentation {
  category: PlaybackErrorCategory
  title: string
  message: string
  /** Optional secondary line below the main message */
  hint?: string
  /** Show encrypted-video wallet note (only for decrypt/signing failures) */
  showEncryptedNote: boolean
}

/**
 * Structured error for player UI (title + body + hints).
 */
export class PlaybackLoadError extends Error {
  readonly presentation: PlaybackErrorPresentation

  constructor(presentation: PlaybackErrorPresentation) {
    super(presentation.message)
    this.name = 'PlaybackLoadError'
    this.presentation = presentation
  }
}

function storagePresentation(
  title: string,
  message: string,
  hint?: string
): PlaybackErrorPresentation {
  return {
    category: 'storage',
    title,
    message,
    hint,
    showEncryptedNote: false,
  }
}

function havenAolPresentation(message: string, code: string): PlaybackErrorPresentation {
  const lower = code.toLowerCase()
  const isWallet =
    code === 'WALLET_NOT_CONNECTED' ||
    code === 'SIGNING_REJECTED' ||
    code === 'INSUFFICIENT_BALANCE'
  const isCancelled = code === 'CANCELLED'

  if (isCancelled) {
    return {
      category: 'cancelled',
      title: 'Playback cancelled',
      message,
      showEncryptedNote: false,
    }
  }

  if (message.toLowerCase().includes('too large') || message.toLowerCase().includes('out of memory')) {
    return {
      category: 'size',
      title: 'Video too large',
      message,
      hint: 'Use the Haven desktop app for very large encrypted videos.',
      showEncryptedNote: false,
    }
  }

  return {
    category: isWallet ? 'wallet' : 'decryption',
    title: isWallet ? 'Wallet required' : 'Decryption failed',
    message,
    hint: isWallet
      ? 'Connect the wallet that owns this video and approve the signature when prompted.'
      : 'If this persists, the file may be corrupted or access rules may have changed.',
    showEncryptedNote: true,
  }
}

/**
 * True when loading was cancelled or superseded (not a user-visible failure).
 */
export function isPlaybackCancellation(error: unknown): boolean {
  if (error instanceof Error && error.message === 'Loading cancelled') {
    return true
  }
  if (error instanceof IpfsError && error.code === 'ABORTED') {
    return true
  }
  if (error instanceof SynapseError && error.code === 'ABORTED') {
    return true
  }
  if (error instanceof HavenAolDecryptError && error.code === 'CANCELLED') {
    return true
  }
  return false
}

/**
 * Resolve a playback pipeline error to structured UI copy.
 */
export function getPlaybackErrorPresentation(error: unknown): PlaybackErrorPresentation {
  if (error instanceof PlaybackLoadError) {
    return error.presentation
  }

  if (error instanceof SynapseError) {
    return storagePresentation(
      getSynapseErrorTitle(error.code),
      getSynapseErrorMessage(error),
      error.code === 'STILL_PROPAGATING'
        ? 'New uploads can take a few minutes before they are readable in the browser.'
        : error.code === 'PIECE_NOT_FOUND' || error.code === 'DOWNLOAD_FAILED'
          ? 'Run haven-cli upload to completion before opening the video here.'
          : undefined
    )
  }

  if (error instanceof EncryptedPayloadError) {
    return storagePresentation(
      'Unexpected download format',
      error.message
    )
  }

  if (error instanceof IpfsError) {
    const message = getIpfsErrorMessage(error)
    if (error.code === 'ABORTED') {
      return {
        category: 'cancelled',
        title: 'Playback cancelled',
        message,
        showEncryptedNote: false,
      }
    }
    return storagePresentation('Could not load from Filecoin', message)
  }

  if (error instanceof HavenAolDecryptError) {
    return havenAolPresentation(error.message, error.code)
  }

  if (error instanceof Error) {
    const msg = getHavenAolErrorMessage(error)
    const lower = msg.toLowerCase()

    if (lower.includes('cancelled')) {
      return {
        category: 'cancelled',
        title: 'Playback cancelled',
        message: msg,
        showEncryptedNote: false,
      }
    }
    if (
      lower.includes('signature') ||
      lower.includes('wallet') ||
      lower.includes('reject')
    ) {
      return havenAolPresentation(msg, 'SIGNING_REJECTED')
    }
    if (lower.includes('too large') || lower.includes('out of memory')) {
      return {
        category: 'size',
        title: 'Video too large',
        message: msg,
        showEncryptedNote: false,
      }
    }
    if (
      lower.includes('claims') &&
      lower.includes('exceeds maximum allowed chunk size')
    ) {
      return storagePresentation(
        'Unexpected download format',
        'The Filecoin download does not look like a haven-cli encrypted video (chunk header mismatch). ' +
          'This often means the piece is still CAR-wrapped or the upload was not encrypted with streaming format. ' +
          'Try re-uploading with the current haven-cli.'
      )
    }

    if (lower.includes('mediasource open timed out')) {
      return {
        category: 'unknown',
        title: 'Player setup timed out',
        message:
          'The video downloaded from Filecoin but the browser player did not start in time. Try again, or use Chrome/Edge on desktop.',
        hint: 'Very large files may need a moment after download before playback begins.',
        showEncryptedNote: false,
      }
    }

    if (
      lower.includes('synapse') ||
      lower.includes('filecoin') ||
      lower.includes('provider retrieval')
    ) {
      return storagePresentation('Could not load from Filecoin', msg)
    }

    return {
      category: 'unknown',
      title: 'Playback failed',
      message: msg,
      showEncryptedNote: true,
    }
  }

  return {
    category: 'unknown',
    title: 'Playback failed',
    message: 'An unexpected error occurred while loading this video.',
    showEncryptedNote: false,
  }
}

/**
 * Resolve a playback pipeline error to a single message string (legacy helpers).
 */
export function getPlaybackErrorMessage(error: unknown): string {
  return getPlaybackErrorPresentation(error).message
}

/**
 * Wrap any error as {@link PlaybackLoadError} for the player UI.
 */
export function toPlaybackLoadError(error: unknown): PlaybackLoadError {
  if (error instanceof PlaybackLoadError) {
    return error
  }
  return new PlaybackLoadError(getPlaybackErrorPresentation(error))
}
