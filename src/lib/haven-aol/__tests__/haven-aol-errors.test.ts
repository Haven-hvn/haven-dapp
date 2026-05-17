/**
 * Tests for haven-aol-errors.ts
 */

import { describe, it, expect } from 'vitest'
import {
  getHavenAolErrorMessage,
  isWalletSignatureRejection,
} from '../haven-aol-errors'
import { IpfsError } from '../../ipfs'
import { getPlaybackErrorMessage } from '../../playback-errors'

describe('isWalletSignatureRejection', () => {
  it('does not treat Synapse provider failures as wallet rejection', () => {
    const synapseErr = new Error(
      'Failed to fetch via Synapse after 3 attempts. Last error: StorageManager download failed: ' +
        'All provider retrieval attempts failed and no additional retriever method was configured - ' +
        'Too many promises rejected'
    )
    expect(isWalletSignatureRejection(synapseErr)).toBe(false)
  })

  it('detects user rejected wallet errors', () => {
    expect(isWalletSignatureRejection(new Error('User rejected the request'))).toBe(true)
  })
})

describe('getHavenAolErrorMessage', () => {
  it('does not map Synapse "promises rejected" to signature copy', () => {
    const err = new Error(
      'Failed to fetch via Synapse: Too many promises rejected'
    )
    expect(getHavenAolErrorMessage(err)).not.toMatch(/approve the signature/)
  })
})

describe('getPlaybackErrorMessage', () => {
  it('maps IpfsError before Haven-AOL heuristics', () => {
    const err = new IpfsError(
      'Failed to fetch via Synapse after 3 attempts',
      'ALL_GATEWAYS_FAILED',
      'bafkzcibtest'
    )
    const msg = getPlaybackErrorMessage(err)
    expect(msg).toMatch(/Filecoin storage/)
    expect(msg).not.toMatch(/signature/)
  })
})
