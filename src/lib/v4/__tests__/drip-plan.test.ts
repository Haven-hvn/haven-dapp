/**
 * V4 drip plan tests — range math, validation, formatting.
 *
 * @module lib/v4/__tests__/drip-plan
 */

import { describe, it, expect } from 'vitest'
import {
  MAX_DRIP_CHUNKS,
  DRIP_TARGET_PRESETS,
  formatUsdCompact,
  planDripChunks,
  sliceDripChunk,
  validateDripConfig,
} from '../drip-plan'

describe('validateDripConfig', () => {
  it('accepts a valid 3-chunk ladder', () => {
    expect(validateDripConfig({ chunkCount: 3, targetsUsd: [1e6, 5e6, 1e7] })).toEqual([])
  })

  it('rejects chunk counts below 1 or above the max', () => {
    const low = validateDripConfig({ chunkCount: 0, targetsUsd: [] })
    expect(low).toContainEqual({ code: 'CHUNK_COUNT_TOO_SMALL' })

    const high = validateDripConfig({
      chunkCount: MAX_DRIP_CHUNKS + 1,
      targetsUsd: Array(MAX_DRIP_CHUNKS + 1).fill(1),
    })
    expect(high).toContainEqual({ code: 'CHUNK_COUNT_TOO_LARGE', max: MAX_DRIP_CHUNKS })
  })

  it('reports target/count mismatch with both counts', () => {
    const errors = validateDripConfig({ chunkCount: 3, targetsUsd: [1, 2] })
    expect(errors).toContainEqual({ code: 'TARGET_COUNT_MISMATCH', expected: 3, actual: 2 })
  })

  it('rejects non-positive and non-finite targets', () => {
    const errors = validateDripConfig({ chunkCount: 2, targetsUsd: [0, -5] })
    expect(errors.filter((e) => e.code === 'TARGET_NOT_POSITIVE')).toHaveLength(2)
  })

  it('rejects equal and descending ladders (strictly ascending required)', () => {
    const equal = validateDripConfig({ chunkCount: 2, targetsUsd: [5, 5] })
    expect(equal).toContainEqual({ code: 'TARGETS_NOT_ASCENDING', index: 1 })

    const desc = validateDripConfig({ chunkCount: 2, targetsUsd: [10, 1] })
    expect(desc).toContainEqual({ code: 'TARGETS_NOT_ASCENDING', index: 1 })
  })

  it('collects multiple error classes at once', () => {
    const errors = validateDripConfig({ chunkCount: 99, targetsUsd: [] })
    expect(errors.length).toBeGreaterThanOrEqual(2)
  })
})

describe('planDripChunks', () => {
  it('produces contiguous ranges covering the whole file', () => {
    const fileSize = 10_000
    const result = planDripChunks(fileSize, { chunkCount: 4, targetsUsd: [1, 2, 3, 4] })
    if (!result.ok) throw new Error('expected ok')

    let cursor = 0
    for (const [i, chunk] of result.chunks.entries()) {
      expect(chunk.dripIndex).toBe(i)
      expect(chunk.dripTotal).toBe(4)
      expect(chunk.startByte).toBe(cursor)
      cursor = chunk.endByte
    }
    expect(cursor).toBe(fileSize)
  })

  it('gives the last chunk the remainder (no dropped bytes)', () => {
    const fileSize = 1003
    const result = planDripChunks(fileSize, { chunkCount: 3, targetsUsd: [1, 2, 3] })
    if (!result.ok) throw new Error('expected ok')
    const sizes = result.chunks.map((c) => c.endByte - c.startByte)
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(fileSize)
    // floor split: first chunks get 334 each, last gets 335
    expect(sizes).toEqual([334, 334, 335])
  })

  it('handles single-chunk drips', () => {
    const result = planDripChunks(500, { chunkCount: 1, targetsUsd: [7_000_000] })
    if (!result.ok) throw new Error('expected ok')
    expect(result.chunks[0]).toMatchObject({
      dripIndex: 0,
      dripTotal: 1,
      startByte: 0,
      endByte: 500,
      marketCapTargetUsd: 7_000_000,
    })
  })

  it('fails closed on invalid config', () => {
    const result = planDripChunks(500, { chunkCount: 2, targetsUsd: [9, 1] })
    expect(result.ok).toBe(false)
  })
})

describe('sliceDripChunk', () => {
  it('copies exactly the planned byte window', () => {
    const source = Uint8Array.from({ length: 10 }, (_, i) => i)
    const slice = sliceDripChunk(source, {
      dripIndex: 1,
      dripTotal: 2,
      startByte: 5,
      endByte: 10,
      marketCapTargetUsd: 1,
    })
    expect([...slice]).toEqual([5, 6, 7, 8, 9])
  })

  it('throws on out-of-bounds plans', () => {
    const source = new Uint8Array(4)
    expect(() =>
      sliceDripChunk(source, {
        dripIndex: 0,
        dripTotal: 1,
        startByte: 0,
        endByte: 5,
        marketCapTargetUsd: 1,
      })
    ).toThrow(/Invalid drip range/)
  })
})

describe('formatUsdCompact', () => {
  it.each([
    [1_000_000, '$1M'],
    [3_100_000, '$3.1M'],
    [10_000_000, '$10M'],
    [450_000, '$450K'],
    [950, '$950'],
  ])('formats %d as %s', (input, expected) => {
    expect(formatUsdCompact(input)).toBe(expected)
  })
})

describe('DRIP_TARGET_PRESETS', () => {
  it('presets are strictly ascending ladders within bounds', () => {
    for (const preset of DRIP_TARGET_PRESETS) {
      expect(preset.targetsUsd.length).toBeGreaterThanOrEqual(1)
      expect(preset.targetsUsd.length).toBeLessThanOrEqual(MAX_DRIP_CHUNKS)
      expect(validateDripConfig({
        chunkCount: preset.targetsUsd.length,
        targetsUsd: preset.targetsUsd,
      })).toEqual([])
    }
  })
})
