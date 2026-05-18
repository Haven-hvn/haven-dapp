import { describe, expect, it } from 'vitest'
import {
  classifyRetrievalFailure,
  getSynapseErrorMessageForCode,
} from '../synapse-errors'

describe('classifyRetrievalFailure', () => {
  it('detects CDN rail mismatch', () => {
    expect(
      classifyRetrievalFailure('HTTP 402: deal has withCDN=false')
    ).toBe('CDN_RAIL_MISMATCH')
  })

  it('detects piece not found', () => {
    expect(
      classifyRetrievalFailure('All provider retrieval attempts failed')
    ).toBe('PIECE_NOT_FOUND')
  })

  it('detects network errors', () => {
    expect(classifyRetrievalFailure('Failed to fetch')).toBe('NETWORK_ERROR')
  })
})

describe('getSynapseErrorMessageForCode', () => {
  it('returns distinct copy per code', () => {
    expect(getSynapseErrorMessageForCode('CDN_RAIL_MISMATCH')).toMatch(/Re-upload/)
    expect(getSynapseErrorMessageForCode('PIECE_NOT_FOUND')).toMatch(/not found/)
    expect(getSynapseErrorMessageForCode('NETWORK_ERROR')).toMatch(/browser/)
  })
})
