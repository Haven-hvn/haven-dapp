import { describe, expect, it } from 'vitest'
import { IpfsError } from '../ipfs'
import { SynapseError } from '../synapse'
import { getPlaybackErrorMessage } from '../playback-errors'

describe('getPlaybackErrorMessage', () => {
  it('maps Synapse errors before wallet heuristics', () => {
    const err = new SynapseError(
      'Failed to download from Synapse: All provider retrieval attempts failed',
      'DOWNLOAD_FAILED',
      'bafkzcibtest'
    )
    const msg = getPlaybackErrorMessage(err)
    expect(msg).toMatch(/Filecoin storage/)
    expect(msg).not.toMatch(/signature/)
  })

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
