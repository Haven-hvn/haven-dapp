/**
 * V4 token-ceiling tests — pure curve-max math (`maxSupply × finalPrice`).
 *
 * `computeTokenCeiling` never touches the network; the SDK-backed
 * `fetchTokenCeiling` delegates to it after `getDetail()` + `getUsdRate()`.
 *
 * @module lib/v4/__tests__/market-cap
 */

import { describe, it, expect } from 'vitest'
import { computeTokenCeiling } from '../market-cap'

// Wizard token shape: 1B supply, 18 decimals, final price 0.00001 ETH.
const WIZARD_DETAIL = {
  info: {
    maxSupply: 1_000_000_000n * 10n ** 18n,
    decimals: 18,
    reserveDecimals: 18,
    priceForNextMint: 5_000_000_000_000n, // mid-curve: 0.000005 ETH
  },
  steps: [{ rangeTo: 1_000_000_000n * 10n ** 18n, price: 10_000_000_000_000n }],
}

describe('computeTokenCeiling', () => {
  it('computes the wizard-token ceiling: 1B × 0.00001 ETH = 10,000 ETH', () => {
    // Current USD rate for the mid-curve price at $3,200/ETH.
    const currentUsdRate = 0.000005 * 3200
    const c = computeTokenCeiling(WIZARD_DETAIL, currentUsdRate)
    expect(c.ceilingReserveWhole).toBe(10_000)
    expect(c.ceilingReserve).toBeCloseTo(10_000, 6)
    expect(c.ceilingUsd).toBeCloseTo(32_000_000, 0)
  })

  it('falls back to priceForNextMint when steps are absent', () => {
    const { steps: _drop, ...rest } = WIZARD_DETAIL
    void _drop
    const c = computeTokenCeiling(rest, 0.016)
    // 1B × 0.000005 ETH = 5,000 ETH.
    expect(c.ceilingReserveWhole).toBe(5_000)
  })

  it('returns nulls on malformed, zero-price, or zero-supply curves', () => {
    expect(computeTokenCeiling(null, 1)).toEqual({
      ceilingReserveWhole: null,
      ceilingReserve: null,
      ceilingUsd: null,
    })
    expect(computeTokenCeiling({ info: {} }, 1).ceilingReserveWhole).toBeNull()
    expect(
      computeTokenCeiling(
        { info: { ...WIZARD_DETAIL.info, priceForNextMint: 0n }, steps: [] },
        1
      ).ceilingReserveWhole
    ).toBeNull()
    expect(
      computeTokenCeiling({ info: { ...WIZARD_DETAIL.info, maxSupply: 0n }, steps: [] }, 1)
        .ceilingReserveWhole
    ).toBeNull()
  })

  it('still reports the reserve ceiling when the USD rate is unknown', () => {
    const c = computeTokenCeiling(WIZARD_DETAIL, null)
    expect(c.ceilingReserveWhole).toBe(10_000)
    expect(c.ceilingUsd).toBeNull()
  })
})
