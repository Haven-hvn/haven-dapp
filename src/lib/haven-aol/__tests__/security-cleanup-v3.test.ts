/**
 * Vitest — Sprint 5 — wallet-disconnect clears the v3 gate-key cache.
 *
 * Verifies the Sprint 5 acceptance criterion:
 *   "Cache is cleared on wallet disconnect (test)."
 *
 * Covers both the existing `GateKeyCache` (Uint8Array bytes) and the new
 * `v3VetKeyCache` (VetKey instances).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock heavy IndexedDB / OPFS deps so the security-cleanup module
// imports without exploding in node test env.
vi.mock('@icp-sdk/vetkeys', () => {
  class MockVk {
    readonly #b: Uint8Array
    constructor(b: Uint8Array) { this.#b = b }
    serialize(): Uint8Array { return new Uint8Array(this.#b) }
    static deserialize(b: Uint8Array): MockVk { return new MockVk(b) }
  }
  return { VetKey: MockVk }
})

vi.mock('../../video-cache', () => ({ clearAllVideos: vi.fn(async () => {}) }))
vi.mock('../../opfs', () => ({ clearAllStaging: vi.fn(async () => {}) }))
vi.mock('../../aes-key-cache', () => ({ clearAllKeys: vi.fn() }))
vi.mock('../haven-aol-nonce', () => ({ clearNonce: vi.fn() }))
vi.mock('../haven-aol-client', () => ({ clearAgentCache: vi.fn() }))

import { VetKey } from '@icp-sdk/vetkeys'
import { GateKeyCache, gateKeyCache } from '../haven-aol-gate-key-cache'
import { v3VetKeyHas, v3VetKeySet, clearV3VetKeyCache } from '../haven-aol-v3-cache'
import { onWalletDisconnect, onAccountChange } from '../../security-cleanup'

const SAMPLE_TOKEN = '0x1234567890abcdef1234567890abcdef12345678'

function warmGateKeyCache(): string {
  const key = GateKeyCache.makeKey({
    chain: 'EthMainnet',
    tokenAddress: SAMPLE_TOKEN,
    threshold: 1n,
    epoch: 100n,
  })
  gateKeyCache.put(key, new Uint8Array([1, 2, 3]))
  return key
}

function warmV3Cache(): string {
  const key = GateKeyCache.makeKey({
    chain: 'EthMainnet',
    tokenAddress: SAMPLE_TOKEN,
    threshold: 1n,
    epoch: 100n,
  })
  v3VetKeySet(key, VetKey.deserialize(new Uint8Array([4, 5, 6])))
  return key
}

beforeEach(() => {
  gateKeyCache.clear()
  clearV3VetKeyCache()
})

describe('security-cleanup wires the v3 gate-key cache', () => {
  it('onWalletDisconnect() clears GateKeyCache', () => {
    const key = warmGateKeyCache()
    expect(gateKeyCache.has(key)).toBe(true)
    onWalletDisconnect('0xABCDef1234567890abcDEF1234567890ABCDeF12')
    expect(gateKeyCache.has(key)).toBe(false)
  })

  it('onWalletDisconnect() clears v3VetKeyCache', () => {
    const key = warmV3Cache()
    expect(v3VetKeyHas(key)).toBe(true)
    onWalletDisconnect('0xABCDef1234567890abcDEF1234567890ABCDeF12')
    expect(v3VetKeyHas(key)).toBe(false)
  })

  it('onAccountChange() clears GateKeyCache', () => {
    const key = warmGateKeyCache()
    expect(gateKeyCache.has(key)).toBe(true)
    onAccountChange(
      '0xAAAA000000000000000000000000000000000000',
      '0xBBBB000000000000000000000000000000000000',
    )
    expect(gateKeyCache.has(key)).toBe(false)
  })

  it('onAccountChange() clears v3VetKeyCache', () => {
    const key = warmV3Cache()
    expect(v3VetKeyHas(key)).toBe(true)
    onAccountChange(
      '0xAAAA000000000000000000000000000000000000',
      '0xBBBB000000000000000000000000000000000000',
    )
    expect(v3VetKeyHas(key)).toBe(false)
  })
})
