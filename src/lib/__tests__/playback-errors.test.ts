import { describe, expect, it } from 'vitest'
import { IpfsError } from '../ipfs'
import { SynapseError } from '../synapse'
import {
  getPlaybackErrorMessage,
  getPlaybackErrorPresentation,
  PlaybackLoadError,
  toPlaybackLoadError,
} from '../playback-errors'
import { HavenAolDecryptError } from '../haven-aol/haven-aol-errors'

describe('getPlaybackErrorPresentation', () => {
  it('maps Synapse PIECE_NOT_FOUND with storage title and no encrypted note', () => {
    const err = new SynapseError(
      'All provider retrieval attempts failed',
      'PIECE_NOT_FOUND',
      'bafkzcibtest'
    )
    const p = getPlaybackErrorPresentation(err)
    expect(p.category).toBe('storage')
    expect(p.title).toBe('Video not on Filecoin')
    expect(p.message).toMatch(/not found/)
    expect(p.showEncryptedNote).toBe(false)
  })

  it('maps CDN rail mismatch for legacy uploads', () => {
    const err = new SynapseError('402 withCDN=false', 'CDN_RAIL_MISMATCH')
    const p = getPlaybackErrorPresentation(err)
    expect(p.title).toBe('Upload needs CDN')
    expect(p.message).toMatch(/Re-upload/)
  })

  it('maps Synapse errors before wallet heuristics', () => {
    const err = new SynapseError(
      'Too many promises rejected',
      'PIECE_NOT_FOUND',
      'bafkzcibtest'
    )
    const msg = getPlaybackErrorMessage(err)
    expect(msg).toMatch(/not found/)
    expect(msg).not.toMatch(/signature/)
  })

  it('maps IpfsError ALL_GATEWAYS_FAILED using nested classification', () => {
    const err = new IpfsError(
      'Failed after 3 attempts. Last error: No provider found',
      'ALL_GATEWAYS_FAILED',
      'bafkzcibtest'
    )
    const p = getPlaybackErrorPresentation(err)
    expect(p.category).toBe('storage')
    expect(p.message).toMatch(/not found/)
  })

  it('shows encrypted note only for wallet/decrypt failures', () => {
    const storage = getPlaybackErrorPresentation(
      new SynapseError('x', 'NETWORK_ERROR')
    )
    expect(storage.showEncryptedNote).toBe(false)

    const wallet = getPlaybackErrorPresentation(
      new HavenAolDecryptError('Sign please', 'SIGNING_REJECTED')
    )
    expect(wallet.showEncryptedNote).toBe(true)
    expect(wallet.title).toBe('Wallet required')
  })
})

describe('toPlaybackLoadError', () => {
  it('wraps errors in PlaybackLoadError', () => {
    const wrapped = toPlaybackLoadError(
      new SynapseError('Failed to fetch', 'NETWORK_ERROR')
    )
    expect(wrapped).toBeInstanceOf(PlaybackLoadError)
    expect(wrapped.presentation.title).toBe('Connection problem')
  })
})
