/**
 * User-facing errors for encrypted video playback (retrieval + decrypt).
 *
 * Retrieval (Synapse) runs before any wallet signature. Map those errors first.
 *
 * @module lib/playback-errors
 */

import { getHavenAolErrorMessage } from './haven-aol/haven-aol-errors'
import { IpfsError, getIpfsErrorMessage } from './ipfs'
import { SynapseError, getSynapseErrorMessage } from './synapse'

/**
 * Resolve a playback pipeline error to UI copy.
 * Order: storage retrieval → Haven-AOL / wallet.
 */
export function getPlaybackErrorMessage(error: unknown): string {
  if (error instanceof IpfsError) {
    return getIpfsErrorMessage(error)
  }
  if (error instanceof SynapseError) {
    return getSynapseErrorMessage(error)
  }
  return getHavenAolErrorMessage(error)
}
