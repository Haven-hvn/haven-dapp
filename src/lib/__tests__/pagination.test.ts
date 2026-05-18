import { describe, expect, it } from 'vitest'
import {
  clampPage,
  getPageCount,
  getPageItemRange,
  getVisiblePageTokens,
  slicePage,
} from '../pagination'

describe('pagination', () => {
  it('getPageCount rounds up', () => {
    expect(getPageCount(0, 10)).toBe(1)
    expect(getPageCount(10, 10)).toBe(1)
    expect(getPageCount(11, 10)).toBe(2)
    expect(getPageCount(25, 10)).toBe(3)
  })

  it('slicePage returns correct window', () => {
    const items = Array.from({ length: 25 }, (_, i) => i + 1)
    expect(slicePage(items, 1, 10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(slicePage(items, 2, 10)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20])
    expect(slicePage(items, 3, 10)).toEqual([21, 22, 23, 24, 25])
  })

  it('clampPage bounds page', () => {
    expect(clampPage(0, 3)).toBe(1)
    expect(clampPage(99, 3)).toBe(3)
  })

  it('getPageItemRange describes visible items', () => {
    expect(getPageItemRange(25, 2, 10)).toEqual({ start: 11, end: 20 })
    expect(getPageItemRange(0, 1, 10)).toEqual({ start: 0, end: 0 })
  })

  it('getVisiblePageTokens shows compact range for many pages', () => {
    expect(getVisiblePageTokens(5, 12)).toEqual([1, 'ellipsis', 4, 5, 6, 'ellipsis', 12])
    expect(getVisiblePageTokens(1, 3)).toEqual([1, 2, 3])
  })
})
