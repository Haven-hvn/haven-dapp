/**
 * Tests for arkiv-recency.ts
 */

import { describe, it, expect } from 'vitest'
import {
  parseCreatedAtBlock,
  pickLatestArkivEntity,
  compareVideosByRecency,
} from '../arkiv-recency'
import type { ArkivEntity } from '../arkiv'
import { createMockVideo } from '../cache/__tests__/fixtures'

function mockEntity(key: string, block: number): ArkivEntity {
  return {
    key,
    owner: '0x1',
    attributes: {},
    payload: '',
    content_type: 'application/json',
    created_at: String(block),
    created_at_block: block,
  }
}

describe('parseCreatedAtBlock', () => {
  it('parses bigint and numeric strings', () => {
    expect(parseCreatedAtBlock(42n)).toBe(42)
    expect(parseCreatedAtBlock('9001')).toBe(9001)
  })

  it('returns 0 for empty values', () => {
    expect(parseCreatedAtBlock(undefined)).toBe(0)
    expect(parseCreatedAtBlock('')).toBe(0)
  })
})

describe('pickLatestArkivEntity', () => {
  it('returns entity with highest block', () => {
    const latest = pickLatestArkivEntity([
      mockEntity('0xold', 100),
      mockEntity('0xnew', 500),
      mockEntity('0xmid', 300),
    ])
    expect(latest?.key).toBe('0xnew')
  })
})

describe('compareVideosByRecency', () => {
  it('orders by createdAtBlock before createdAt', () => {
    const olderDate = createMockVideo({
      id: '0x1',
      createdAt: new Date('2025-06-01'),
      createdAtBlock: 100,
    })
    const newerBlock = createMockVideo({
      id: '0x2',
      createdAt: new Date('2024-01-01'),
      createdAtBlock: 9000,
    })

    expect(compareVideosByRecency(olderDate, newerBlock)).toBeGreaterThan(0)
    expect(compareVideosByRecency(newerBlock, olderDate)).toBeLessThan(0)
  })
})
