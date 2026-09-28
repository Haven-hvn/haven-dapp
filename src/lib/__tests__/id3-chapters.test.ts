/**
 * Tests for the ID3 chapter + cover parser (TS port of haven-mobile
 * `feature-watch/ChaptersTest`, same byte-layout pins).
 *
 * Fixtures are hand-built ID3v2.3 tags: two `CHAP` frames with `TIT2`
 * subframes, one `CTOC` table, one `APIC` picture. Edge cases pin the
 * fail-soft contract — foreign/truncated tags yield nothing, never throw.
 *
 * @module lib/__tests__/id3-chapters.test
 */

import { describe, expect, it } from 'vitest'
import {
  chapterIndexAt,
  parseId3Chapters,
  parseId3Cover,
} from '../id3-chapters'

function u32be(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]
}

function latin1(text: string): number[] {
  return [...text].map((c) => c.charCodeAt(0) & 0xff)
}

function frame(id: string, data: number[]): number[] {
  return [...latin1(id), ...u32be(data.length), 0x00, 0x00, ...data]
}

function tit2(title: string): number[] {
  const text = [...Buffer.from(title, 'utf8')]
  return frame('TIT2', [0x03, ...text])
}

function chap(elementId: string, startMs: number, title: string): number[] {
  const data = [
    ...latin1(elementId), 0x00,
    ...u32be(startMs), ...u32be(startMs + 1000),
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    ...tit2(title),
  ]
  return frame('CHAP', data)
}

function ctoc(elementId: string, entries: string[]): number[] {
  const data = [
    ...latin1(elementId), 0x00,
    0x03, entries.length,
    ...entries.flatMap((e) => [...latin1(e), 0x00]),
  ]
  return frame('CTOC', data)
}

function apic(mime: string, picture: number[]): number[] {
  return frame('APIC', [0x00, ...latin1(mime), 0x00, 0x03, 0x00, ...picture])
}

function tag(major: number, frames: number[], flags = 0x00): Uint8Array {
  const size = frames.length
  const syncsafe = [(size >>> 21) & 0x7f, (size >>> 14) & 0x7f, (size >>> 7) & 0x7f, size & 0x7f]
  return new Uint8Array([0x49, 0x44, 0x33, major, 0x00, flags, ...syncsafe, ...frames])
}

function albumTag(): Uint8Array {
  return tag(3, [
    ...chap('ch0', 0, 'Track One'),
    ...chap('ch1', 105000, 'Track Two'),
    ...ctoc('toc', ['ch0', 'ch1']),
    ...apic('image/png', [0x89, 0x50, 0x4e, 0x47]),
  ])
}

describe('parseId3Chapters', () => {
  it('parses chapters in CTOC order with titles and start times', () => {
    expect(parseId3Chapters(albumTag())).toEqual([
      { startMs: 0, title: 'Track One' },
      { startMs: 105000, title: 'Track Two' },
    ])
  })

  it('falls back to start-time order without a CTOC table', () => {
    const t = tag(3, [
      ...chap('b', 200000, 'Second'),
      ...chap('a', 0, 'First'),
    ])
    expect(parseId3Chapters(t).map((c) => c.title)).toEqual(['First', 'Second'])
  })

  it('falls back to element id, then Chapter N, for missing titles', () => {
    const noTit2 = frame('CHAP', [...latin1('ch9'), 0x00, ...u32be(5000), ...u32be(6000),
      0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff])
    expect(parseId3Chapters(tag(3, noTit2))).toEqual([{ startMs: 5000, title: 'ch9' }])
  })

  it('returns no chapters for a v2.2 tag, garbage, or truncation', () => {
    expect(parseId3Chapters(tag(2, chap('ch0', 0, 'x')))).toEqual([])
    expect(parseId3Chapters(new Uint8Array([1, 2, 3, 4]))).toEqual([])
    expect(parseId3Chapters(new Uint8Array(0))).toEqual([])
    expect(parseId3Chapters(albumTag().slice(0, 25))).toEqual([])
  })

  it('stops at tag padding instead of scanning on', () => {
    const padded = new Uint8Array([...albumTag(), ...new Array(64).fill(0)])
    expect(parseId3Chapters(padded)).toHaveLength(2)
  })
})

describe('chapterIndexAt', () => {
  const chapters = [
    { startMs: 0, title: 'a' },
    { startMs: 100000, title: 'b' },
  ]

  it('finds the latest start at or before the position', () => {
    expect(chapterIndexAt(chapters, 0)).toBe(0)
    expect(chapterIndexAt(chapters, 99999)).toBe(0)
    expect(chapterIndexAt(chapters, 100000)).toBe(1)
    expect(chapterIndexAt(chapters, 999999)).toBe(1)
  })

  it('returns -1 without chapters', () => {
    expect(chapterIndexAt([], 5000)).toBe(-1)
  })
})

describe('parseId3Cover', () => {
  it('extracts the first APIC picture with its MIME', () => {
    const cover = parseId3Cover(albumTag())
    expect(cover?.mime).toBe('image/png')
    expect([...cover!.bytes]).toEqual([0x89, 0x50, 0x4e, 0x47])
  })

  it('returns null without an APIC frame', () => {
    expect(parseId3Cover(tag(3, chap('ch0', 0, 'x')))).toBeNull()
    expect(parseId3Cover(new Uint8Array(0))).toBeNull()
  })
})
