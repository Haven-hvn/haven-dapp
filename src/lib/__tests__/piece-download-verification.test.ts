import { describe, expect, it } from 'vitest'
import {
  isPieceCidVerificationFailure,
  PieceDownloadError,
} from '../piece-download'

describe('isPieceCidVerificationFailure', () => {
  it('detects PieceDownloadError with VERIFICATION_FAILED code', () => {
    expect(
      isPieceCidVerificationFailure(
        new PieceDownloadError('PieceCID verification failed', 'VERIFICATION_FAILED')
      )
    ).toBe(true)
  })

  it('detects generic errors by message', () => {
    expect(
      isPieceCidVerificationFailure(
        new Error('PieceCID verification failed. Expected: a, Got: b')
      )
    ).toBe(true)
  })

  it('returns false for other download errors', () => {
    expect(
      isPieceCidVerificationFailure(
        new PieceDownloadError('HTTP 500', 'DOWNLOAD_FAILED')
      )
    ).toBe(false)
  })
})
