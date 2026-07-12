import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  logFetchVerificationKeyDuration,
  logPostSignToIcpKeySuccess,
  logRequestDecryptionKeyDuration,
  markPostWalletSign,
} from '../haven-aol-icp-timing'

describe('haven-aol-icp-timing', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('markPostWalletSign captures performance.now', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(performance, 'now').mockReturnValue(500)

    expect(markPostWalletSign()).toEqual({ postSignStartMs: 500 })
  })

  it('logRequestDecryptionKeyDuration logs round-trip and since-sign', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(performance, 'now').mockReturnValue(1250)

    const mark = { postSignStartMs: 1000 }
    logRequestDecryptionKeyDuration(mark, 180, 0)

    expect(console.info).toHaveBeenCalledWith(
      '[HavenAOL] requestDecryptionKey round-trip: 180ms (attempt 1, 250ms since wallet sign)'
    )
  })

  it('logPostSignToIcpKeySuccess logs total since sign', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(performance, 'now').mockReturnValue(1400)

    const mark = { postSignStartMs: 1000 }
    logPostSignToIcpKeySuccess(mark, 1)

    expect(console.info).toHaveBeenCalledWith(
      '[HavenAOL] ICP decryption key received: 400ms since wallet sign (attempt 2)'
    )
  })

  it('logFetchVerificationKeyDuration logs verification key timing', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})

    logFetchVerificationKeyDuration(95)

    expect(console.info).toHaveBeenCalledWith(
      '[HavenAOL] fetchVerificationKey round-trip: 95ms'
    )
  })
})
