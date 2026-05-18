import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearNonce,
  createRandomGateNonce,
  UINT256_MAX,
} from '../haven-aol-nonce'

const ADDR = '0x3C7d1aDdC0ED70e186a60224ab1c9f8c8969c108'

describe('createRandomGateNonce', () => {
  it('returns non-zero values in uint256 range', () => {
    for (let i = 0; i < 20; i++) {
      const nonce = createRandomGateNonce()
      expect(nonce).toBeGreaterThan(0n)
      expect(nonce).toBeLessThanOrEqual(UINT256_MAX)
    }
  })

  it('generates distinct values across calls', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 50; i++) {
      const nonce = createRandomGateNonce()
      const key = nonce.toString()
      expect(seen.has(key)).toBe(false)
      seen.add(key)
    }
  })
})

describe.runIf(typeof localStorage !== 'undefined')('clearNonce', () => {
  const legacyKey = `haven-aol-nonce-${ADDR.toLowerCase()}`

  beforeEach(() => {
    localStorage.setItem(legacyKey, '41')
  })

  afterEach(() => {
    clearNonce()
  })

  it('removes legacy monotonic nonce keys from localStorage', () => {
    clearNonce(ADDR)
    expect(localStorage.getItem(legacyKey)).toBeNull()
  })
})
