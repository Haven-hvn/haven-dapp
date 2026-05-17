/**
 * Tests for ipfs.ts (CID helpers and retrieval errors)
 */

import { describe, it, expect } from 'vitest'
import { normalizeCid, IpfsError, getIpfsErrorMessage } from '../ipfs'

describe('normalizeCid', () => {
  it('strips ipfs:// prefix', () => {
    expect(normalizeCid('ipfs://QmTest')).toBe('QmTest')
  })

  it('strips leading slash', () => {
    expect(normalizeCid('/QmTest')).toBe('QmTest')
  })
})

describe('IpfsError', () => {
  it('exposes code and cid', () => {
    const err = new IpfsError('bad', 'INVALID_CID', 'cid1')
    expect(err.code).toBe('INVALID_CID')
    expect(err.cid).toBe('cid1')
    expect(err.name).toBe('IpfsError')
  })
})

describe('getIpfsErrorMessage', () => {
  it('maps known IpfsError codes', () => {
    expect(getIpfsErrorMessage(new IpfsError('x', 'INVALID_CID'))).toMatch(/Invalid content/)
    expect(getIpfsErrorMessage(new IpfsError('x', 'ALL_GATEWAYS_FAILED'))).toMatch(/Filecoin storage/)
    expect(getIpfsErrorMessage(new IpfsError('x', 'ABORTED'))).toMatch(/cancelled/)
  })

  it('handles AbortError', () => {
    const err = new Error('aborted')
    err.name = 'AbortError'
    expect(getIpfsErrorMessage(err)).toMatch(/cancelled/)
  })

  it('handles generic errors', () => {
    expect(getIpfsErrorMessage(new Error('network'))).toBe('network')
    expect(getIpfsErrorMessage('oops')).toBe('An unexpected error occurred while fetching content.')
  })
})
