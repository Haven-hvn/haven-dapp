import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  bumpNonce,
  clearNonce,
  getCurrentNonce,
  getNextNonce,
  nonceAfterCollision,
} from '../haven-aol-nonce'

const ADDR = '0x3C7d1aDdC0ED70e186a60224ab1c9f8c8969c108'

describe('haven-aol-nonce', () => {
  beforeEach(() => {
    clearNonce()
    if (typeof localStorage !== 'undefined') {
      localStorage.clear()
    }
  })

  afterEach(() => {
    clearNonce()
  })

  it('getNextNonce increments monotonically', () => {
    expect(getNextNonce(ADDR)).toBe(1n)
    expect(getNextNonce(ADDR)).toBe(2n)
    expect(getCurrentNonce(ADDR)).toBe(2n)
  })

  it('nonceAfterCollision advances by +1 from collided nonce', () => {
    clearNonce(ADDR)
    expect(getNextNonce(ADDR)).toBe(1n)
    expect(nonceAfterCollision(ADDR, 1n)).toBe(2n)
    expect(getNextNonce(ADDR)).toBe(2n)
  })

  it('nonceAfterCollision jumps ahead when local state is behind canister', () => {
    clearNonce(ADDR)
    for (let i = 0; i < 5; i++) {
      getNextNonce(ADDR)
    }
    expect(getCurrentNonce(ADDR)).toBe(5n)
    expect(nonceAfterCollision(ADDR, 41n)).toBe(42n)
    expect(getNextNonce(ADDR)).toBe(42n)
  })

  it('bumpNonce no longer skips +10 (legacy callers)', () => {
    clearNonce(ADDR)
    getNextNonce(ADDR)
    const next = bumpNonce(ADDR)
    expect(next).toBe(2n)
  })
})
