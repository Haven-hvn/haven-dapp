/**
 * Vitest — Sprint 5 — wallet-disconnect clears the v3 gate-key cache.
 *
 * Verifies the Sprint 5 acceptance criterion:
 *   "Cache is cleared on wallet disconnect (test)."
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock heavy IndexedDB / OPFS deps so the security-cleanup module
// imports without exploding in node test env.
vi.mock('../../video-cache', () => ({ clearAllVideos: vi.fn(async () => {}) }))
vi.mock('../../opfs', () => ({ clearAllStaging: vi.fn(async () => {}) }))
vi.mock('../../aes-key-cache', () => ({ clearAllKeys: vi.fn() }))
vi.mock('../haven-aol-nonce', () => ({ clearNonce: vi.fn() }))
vi.mock('../haven-aol-client', () => ({ clearAgentCache: vi.fn() }))

import { GateKeyCache, gateKeyCache } from '../haven-aol-gate-key-cache'
import { onWalletDisconnect, onAccountChange } from '../../security-cleanup'

const SAMPLE_TOKEN = '0x1234567890abcdef1234567890abcdef12345678'

function warm(): string {
  const key = GateKeyCache.makeKey({
    chain: 'EthMainnet',
    tokenAddress: SAMPLE_TOKEN,
    threshold: 1n,
    epoch: 100n,
  })
  gateKeyCache.put(key, new Uint8Array([1, 2, 3]))
  return key
}

beforeEach(() => {
  gateKeyCache.clear()
})

describe('security-cleanup wires the v3 gate-key cache', () => {
  it('onWalletDisconnect() clears the gate-key cache', () => {
    const key = warm()
    expect(gateKeyCache.has(key)).toBe(true)
    onWalletDisconnect('0xABCDef1234567890abcDEF1234567890ABCDeF12')
    expect(gateKeyCache.has(key)).toBe(false)
  })

  it('onAccountChange() clears the gate-key cache', () => {
    const key = warm()
    onAccountChange(
      '0xAAAA000000000000000000000000000000000000',
      '0xBBBB000000000000000000000000000000000000',
    )
    expect(gateKeyCache.has(key)).toBe(false)
  })
})
