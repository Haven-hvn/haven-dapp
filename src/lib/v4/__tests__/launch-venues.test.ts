/**
 * Launch-venue tests — graduation support and creator-fee fallback.
 *
 * @module lib/v4/__tests__/launch-venues
 */

import { describe, it, expect } from 'vitest'
import {
  DEFAULT_GATE_CHAIN,
  isGraduationSupported,
  isGraduationAvailable,
  launchModeFor,
  creatorFeeBpsFor,
} from '../launch-venues'
import { getGraduateDeployment } from '../graduate'

describe('launch venues', () => {
  it('defaults new publishes to Optimism', () => {
    expect(DEFAULT_GATE_CHAIN).toBe('OptimismMainnet')
  })

  it('supports graduation on Glue + Uniswap chains', () => {
    for (const chain of ['OptimismMainnet', 'BaseMainnet', 'ArbitrumOne', 'EthMainnet']) {
      expect(isGraduationSupported(chain)).toBe(true)
      expect(launchModeFor(chain)).toBe('graduate')
      expect(creatorFeeBpsFor(chain)).toBeGreaterThan(0)
    }
  })

  it('falls back to mint.club-only with 0 creator fee elsewhere', () => {
    expect(isGraduationSupported('EthSepolia')).toBe(false)
    expect(launchModeFor('EthSepolia')).toBe('mint-only')
    expect(creatorFeeBpsFor('EthSepolia')).toBe(0)
  })

  it('treats unknown chains as mint-only (fail open for gating, closed for fees)', () => {
    expect(launchModeFor('SomeFutureChain')).toBe('mint-only')
    expect(creatorFeeBpsFor('SomeFutureChain')).toBe(0)
  })

  it('reports graduate unavailable without a configured factory', () => {
    // No NEXT_PUBLIC_GRADUATE_FACTORY_* in test env: deployment is null,
    // so the wizard must fall back to mint.club-only even on OP.
    expect(getGraduateDeployment('OptimismMainnet')).toBeNull()
    expect(isGraduationAvailable('OptimismMainnet')).toBe(false)
  })
})
