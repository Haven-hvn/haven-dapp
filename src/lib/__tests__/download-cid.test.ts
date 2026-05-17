/**
 * Tests for download-cid.ts
 */

import { describe, it, expect } from 'vitest'
import {
  isPieceCid,
  isRootIpfsCid,
  resolveSynapseDownloadCid,
} from '../download-cid'
import { createMockVideo } from '../cache/__tests__/fixtures'

describe('isPieceCid', () => {
  it('detects baga piece CIDs', () => {
    expect(isPieceCid('baga6ea4seaqexample')).toBe(true)
  })

  it('rejects root bafy CIDs', () => {
    expect(isPieceCid('bafybeidounfsl4czdwgsodecmdzbe2vfac5mamr3k5vdpml2a6yrgwattu')).toBe(false)
  })
})

describe('isRootIpfsCid', () => {
  it('detects bafy and Qm roots', () => {
    expect(isRootIpfsCid('bafybeidounfsl4czdwgsodecmdzbe2vfac5mamr3k5vdpml2a6yrgwattu')).toBe(true)
    expect(isRootIpfsCid('QmTest123')).toBe(true)
  })
})

describe('resolveSynapseDownloadCid', () => {
  it('prefers pieceCid on video', () => {
    const video = createMockVideo({
      pieceCid: 'baga6ea4seaqdownload',
      filecoinCid: 'bafybeiroot',
    })
    expect(resolveSynapseDownloadCid(video, 'bafybeiroot')).toBe('baga6ea4seaqdownload')
  })

  it('throws when only root CID is available', () => {
    const video = createMockVideo({
      pieceCid: undefined,
      filecoinCid: 'bafybeidounfsl4czdwgsodecmdzbe2vfac5mamr3k5vdpml2a6yrgwattu',
    })
    expect(() =>
      resolveSynapseDownloadCid(video, 'bafybeidounfsl4czdwgsodecmdzbe2vfac5mamr3k5vdpml2a6yrgwattu')
    ).toThrow(/piece CID/)
  })
})
