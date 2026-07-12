/**
 * Tests for download-cid.ts (Filecoin Pin piece CID)
 */

import { describe, it, expect } from 'vitest'
import { isFilecoinPieceCid, requirePieceCid } from '../download-cid'
import { createMockVideo } from '../cache/__tests__/fixtures'

const PIECE = 'bafkzcibe2hzbcd4t6clvsb3mfrezyxl75gl3gzcsqi42dd27gktq4nk75rr62ciuaq'
const ROOT = 'bafybeidounfsl4czdwgsodecmdzbe2vfac5mamr3k5vdpml2a6yrgwattu'

describe('isFilecoinPieceCid', () => {
  it('detects bafkzcib piece CIDs from filecoin-pin', () => {
    expect(isFilecoinPieceCid(PIECE)).toBe(true)
  })

  it('does not treat bafy root as piece', () => {
    expect(isFilecoinPieceCid(ROOT)).toBe(false)
  })
})

describe('requirePieceCid', () => {
  it('returns normalized piece CID from video', () => {
    const video = createMockVideo({ pieceCid: PIECE })
    expect(requirePieceCid(video)).toBe(PIECE)
  })

  it('throws when piece_cid is missing', () => {
    const video = createMockVideo({ pieceCid: undefined })
    expect(() => requirePieceCid(video)).toThrow(/Missing piece_cid/)
  })

  it('throws when piece_cid is not a Filecoin piece CID', () => {
    const video = createMockVideo({ pieceCid: ROOT })
    expect(() => requirePieceCid(video)).toThrow(/Invalid piece_cid/)
  })
})
