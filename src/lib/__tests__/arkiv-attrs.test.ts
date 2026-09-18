/**
 * Tests for arkiv-attrs.ts — SDK 0.8 tagged-map / legacy-array tolerance.
 */

import { describe, it, expect } from 'vitest'
import {
  isTaggedArkivValue,
  unwrapArkivValue,
  toAttributeRecord,
  toAttributeInputs,
} from '../arkiv-attrs'

describe('isTaggedArkivValue', () => {
  it('recognizes tagged SDK values', () => {
    expect(isTaggedArkivValue({ type: 'str', value: 'x' })).toBe(true)
    expect(isTaggedArkivValue({ type: 'i32', value: 4 })).toBe(true)
    expect(isTaggedArkivValue({ type: 'addr', value: '0xabc' })).toBe(true)
  })

  it('rejects bare values and lookalikes', () => {
    expect(isTaggedArkivValue('x')).toBe(false)
    expect(isTaggedArkivValue(4)).toBe(false)
    expect(isTaggedArkivValue(null)).toBe(false)
    expect(isTaggedArkivValue(undefined)).toBe(false)
    expect(isTaggedArkivValue({ type: 'nope', value: 1 })).toBe(false)
    expect(isTaggedArkivValue({ type: 'str' })).toBe(false)
  })
})

describe('unwrapArkivValue', () => {
  it('unwraps tagged values, passes bare values through', () => {
    expect(unwrapArkivValue({ type: 'str', value: 'haven.video.full' })).toBe(
      'haven.video.full'
    )
    expect(unwrapArkivValue({ type: 'i32', value: 8453 })).toBe(8453)
    expect(unwrapArkivValue('bare')).toBe('bare')
    expect(unwrapArkivValue(7)).toBe(7)
  })
})

describe('toAttributeRecord', () => {
  it('normalizes the SDK 0.8 tagged map', () => {
    expect(
      toAttributeRecord({
        grp: { type: 'str', value: 'haven.video.full' },
        gate_type: { type: 'i32', value: 3 },
      })
    ).toEqual({ grp: 'haven.video.full', gate_type: 3 })
  })

  it('still accepts the legacy 0.7 array', () => {
    expect(
      toAttributeRecord([
        { key: 'grp', value: 'haven.video.full' },
        { key: 'gate_type', value: 3 },
      ])
    ).toEqual({ grp: 'haven.video.full', gate_type: 3 })
  })

  it('returns an empty record for missing/garbage input', () => {
    expect(toAttributeRecord(undefined)).toEqual({})
    expect(toAttributeRecord(null)).toEqual({})
    expect(toAttributeRecord(42)).toEqual({})
  })
})

describe('toAttributeInputs', () => {
  it('converts builder arrays to bare-value maps', () => {
    expect(
      toAttributeInputs([
        { key: 'grp', value: 'haven.video.drip.part' },
        { key: 'gate_type', value: 4 },
      ])
    ).toEqual({ grp: 'haven.video.drip.part', gate_type: 4 })
  })
})
