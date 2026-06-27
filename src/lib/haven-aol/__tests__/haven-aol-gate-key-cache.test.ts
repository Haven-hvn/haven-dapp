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

import { describe, it, expect, beforeEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  GateKeyCache,
  gateKeyCache,
  clearGateKeyCache,
} from '../haven-aol-gate-key-cache'

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

  it('round-trips a value', () => {
    const cache = new GateKeyCache()
    const value = new Uint8Array([1, 2, 3, 4, 5])
    cache.put('k', value)
    const retrieved = cache.get('k')
    expect(retrieved).not.toBeNull()
    expect(retrieved!).toEqual(value)
  })

  it('returns a defensive copy from get()', () => {
    const cache = new GateKeyCache()
    cache.put('k', new Uint8Array([1, 2, 3]))
    const a = cache.get('k')!
    const b = cache.get('k')!
    expect(a).not.toBe(b)
    a[0] = 99
    expect(cache.get('k')![0]).toBe(1)
  })

  it('stores a defensive copy via put()', () => {
    const cache = new GateKeyCache()
    const original = new Uint8Array([1, 2, 3])
    cache.put('k', original)
    original[0] = 99
    expect(cache.get('k')![0]).toBe(1)
  })

  it('clear() removes every entry', () => {
    const cache = new GateKeyCache()
    cache.put('a', new Uint8Array([1]))
    cache.put('b', new Uint8Array([2]))
    expect(cache.size()).toBe(2)
    cache.clear()
    expect(cache.size()).toBe(0)
    expect(cache.get('a')).toBeNull()
  })

  it('rejects empty put keys', () => {
    const cache = new GateKeyCache()
    expect(() => cache.put('', new Uint8Array([1]))).toThrow(/non-empty string/)
  })

  it('rejects empty vetKey buffers', () => {
    const cache = new GateKeyCache()
    expect(() => cache.put('k', new Uint8Array(0))).toThrow(/non-empty Uint8Array/)
  })
})

describe('Singleton', () => {
  it('clearGateKeyCache() empties the module-level singleton', () => {
    const key = GateKeyCache.makeKey({
      chain: 'EthMainnet',
      tokenAddress: SAMPLE_TOKEN,
      threshold: 1n,
      epoch: 0n,
    })
    gateKeyCache.put(key, new Uint8Array([7, 8, 9]))
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
    const cache = new GateKeyCache()
    const key = GateKeyCache.makeKey({
      chain: 'EthMainnet',
      tokenAddress: SAMPLE_TOKEN,
      threshold: 1n,
      epoch: 100n,
    })
    cache.put(key, new Uint8Array([42]))

    // Pretend wall clock jumped far into the future.
    const originalNow = Date.now
    try {
      Date.now = () => Number.MAX_SAFE_INTEGER
      // Reconstruct the lookup key using the SAME `metadata.epoch=100`.
      // Decryptor code MUST source the epoch from metadata, never from a
      // local clock read.
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
