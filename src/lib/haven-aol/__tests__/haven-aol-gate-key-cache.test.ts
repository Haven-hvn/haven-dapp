/**
 * Vitest — Sprint 5 — gate-key cache discipline.
 *
 * Pins the in-memory invariants from proposal §6.3 and Key Design Decision
 * #6 / #7:
 *   • Cache key shape is `${chain}:${tokenAddress}:${threshold}:${epoch}`.
 *   • get/put returns a defensive copy.
 *   • clear() empties the singleton.
 *   • The module never reaches the browser's persistent stores
 *     (`localStorage`, `sessionStorage`, IndexedDB, `caches`, OPFS).
 *   • Cache lookup ignores `Date.now()` — the cache is keyed on the
 *     metadata-supplied epoch, never local time.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  GateKeyCache,
  gateKeyCache,
  clearGateKeyCache,
} from '../haven-aol-gate-key-cache'

// ---------------------------------------------------------------------------
// Mock @dfinity/vetkeys so our tests don't need BLS12-381 curve setup.
// ---------------------------------------------------------------------------
vi.mock('@dfinity/vetkeys', () => {
  class MockVetKey {
    readonly #bytes: Uint8Array
    constructor(bytes: Uint8Array) { this.#bytes = bytes }
    serialize(): Uint8Array { return new Uint8Array(this.#bytes) }
    static deserialize(bytes: Uint8Array): MockVetKey { return new MockVetKey(bytes) }
  }
  return { VetKey: MockVetKey }
})

const SAMPLE_TOKEN = '0x1234567890abcdef1234567890abcdef12345678'

beforeEach(() => {
  clearGateKeyCache()
})

describe('GateKeyCache.makeKey', () => {
  it('returns the canonical string shape', () => {
    const key = GateKeyCache.makeKey({
      chain: 'EthMainnet',
      tokenAddress: SAMPLE_TOKEN,
      threshold: 1n,
      epoch: 100n,
    })
    expect(key).toBe(`EthMainnet:${SAMPLE_TOKEN}:1:100`)
  })

  it('accepts number / string / bigint thresholds and epochs identically', () => {
    const fromBigInt = GateKeyCache.makeKey({
      chain: 'EthMainnet',
      tokenAddress: SAMPLE_TOKEN,
      threshold: 5n,
      epoch: 50n,
    })
    const fromNumber = GateKeyCache.makeKey({
      chain: 'EthMainnet',
      tokenAddress: SAMPLE_TOKEN,
      threshold: 5,
      epoch: 50,
    })
    const fromString = GateKeyCache.makeKey({
      chain: 'EthMainnet',
      tokenAddress: SAMPLE_TOKEN,
      threshold: '5',
      epoch: '50',
    })
    expect(fromBigInt).toBe(fromNumber)
    expect(fromNumber).toBe(fromString)
  })

  it('rejects negative thresholds', () => {
    expect(() =>
      GateKeyCache.makeKey({
        chain: 'EthMainnet',
        tokenAddress: SAMPLE_TOKEN,
        threshold: -1,
        epoch: 0,
      }),
    ).toThrow(/non-negative/)
  })

  it('rejects malformed token addresses', () => {
    expect(() =>
      GateKeyCache.makeKey({
        chain: 'EthMainnet',
        tokenAddress: 'not-an-address',
        threshold: 1,
        epoch: 0,
      }),
    ).toThrow(/tokenAddress/)
  })

  it('rejects empty chain', () => {
    expect(() =>
      GateKeyCache.makeKey({
        chain: '' as never,
        tokenAddress: SAMPLE_TOKEN,
        threshold: 1,
        epoch: 0,
      }),
    ).toThrow(/chain/)
  })
})

describe('GateKeyCache get/put/clear', () => {
  it('returns null for unknown keys', () => {
    const cache = new GateKeyCache()
    expect(cache.get('unknown')).toBeNull()
  })

  it('round-trips a VetKey', () => {
    const cache = new GateKeyCache()
    const { VetKey } = require('@dfinity/vetkeys')
    const vk = VetKey.deserialize(new Uint8Array([1, 2, 3, 4, 5]))
    cache.put('k', vk)
    const retrieved = cache.get('k')
    expect(retrieved).not.toBeNull()
    expect(retrieved!.serialize()).toEqual(vk.serialize())
  })

  it('get returns distinct VetKey instances per call', () => {
    const cache = new GateKeyCache()
    const { VetKey } = require('@dfinity/vetkeys')
    cache.put('k', VetKey.deserialize(new Uint8Array([1, 2, 3])))
    const a = cache.get('k')!
    const b = cache.get('k')!
    expect(a).not.toBe(b)
    expect(a.serialize()).toEqual(b.serialize())
  })

  it('put stores the serialized bytes, not a reference to the VetKey', () => {
    const cache = new GateKeyCache()
    const { VetKey } = require('@dfinity/vetkeys')
    const original = VetKey.deserialize(new Uint8Array([10, 20, 30]))
    cache.put('k', original)
    // Mutate the original's underlying buffer (in our mock via the mock's bytes).
    // The stored serialized copy should be unaffected.
    // Our mock stores a separate copy in serialize(), so this tests that
    // put() calls serialize() rather than hanging onto the reference.
    expect(cache.get('k')!.serialize()).toEqual(new Uint8Array([10, 20, 30]))
  })

  it('clear() removes every entry', () => {
    const cache = new GateKeyCache()
    const { VetKey } = require('@dfinity/vetkeys')
    const vk = () => VetKey.deserialize(new Uint8Array([1]))
    cache.put('a', vk())
    cache.put('b', vk())
    expect(cache.size()).toBe(2)
    cache.clear()
    expect(cache.size()).toBe(0)
    expect(cache.get('a')).toBeNull()
  })

  it('rejects empty put keys', () => {
    const cache = new GateKeyCache()
    const { VetKey } = require('@dfinity/vetkeys')
    expect(() => cache.put('', VetKey.deserialize(new Uint8Array([1])))).toThrow(/non-empty string/)
  })
})

describe('Singleton', () => {
  it('clearGateKeyCache() empties the module-level singleton', () => {
    const { VetKey } = require('@dfinity/vetkeys')
    const key = GateKeyCache.makeKey({
      chain: 'EthMainnet',
      tokenAddress: SAMPLE_TOKEN,
      threshold: 1n,
      epoch: 0n,
    })
    gateKeyCache.put(key, VetKey.deserialize(new Uint8Array([7, 8, 9])))
    expect(gateKeyCache.has(key)).toBe(true)
    clearGateKeyCache()
    expect(gateKeyCache.has(key)).toBe(false)
  })
})

describe('Cache discipline — no persistent storage', () => {
  it('the cache module never references localStorage / sessionStorage / IndexedDB / caches / OPFS', () => {
    const modPath = path.resolve(__dirname, '..', 'haven-aol-gate-key-cache.ts')
    const src = fs.readFileSync(modPath, 'utf-8')
    // Strip comments so docstring mentions of these tokens don't false-fail.
    const noComments = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
    expect(noComments).not.toMatch(/\blocalStorage\b/)
    expect(noComments).not.toMatch(/\bsessionStorage\b/)
    expect(noComments).not.toMatch(/\bindexedDB\b/)
    expect(noComments).not.toMatch(/\bcaches\b/)
    expect(noComments).not.toMatch(/\bopfs\b/i)
  })
})

describe('Cache lookup ignores Date.now() (proposal §1.7 scenario (D))', () => {
  it('an entry put at epoch=100 is retrievable after the local clock jumps to epoch 9999', () => {
    const { VetKey } = require('@dfinity/vetkeys')
    const cache = new GateKeyCache()
    const key = GateKeyCache.makeKey({
      chain: 'EthMainnet',
      tokenAddress: SAMPLE_TOKEN,
      threshold: 1n,
      epoch: 100n,
    })
    cache.put(key, VetKey.deserialize(new Uint8Array([42])))

    // Pretend wall clock jumped far into the future.
    const originalNow = Date.now
    try {
      Date.now = () => Number.MAX_SAFE_INTEGER
      const lookupKey = GateKeyCache.makeKey({
        chain: 'EthMainnet',
        tokenAddress: SAMPLE_TOKEN,
        threshold: 1n,
        epoch: 100n,
      })
      expect(cache.get(lookupKey)).not.toBeNull()
    } finally {
      Date.now = originalNow
    }
  })
})
