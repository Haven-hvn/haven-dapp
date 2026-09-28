/**
 * ID3v2 chapter + cover parsing for merged single-file albums (TS port of
 * haven-mobile `feature-watch/Chapters.kt`, same fail-soft contract).
 *
 * The Herald pipeline concatenates an album's tracks into one MP3 and embeds
 * the cue points as ID3 chapters (`CHAP` + `CTOC` frames) plus cover art
 * (`APIC`), so the file stays one sealed record while readers can still jump
 * per track. The platform `<audio>` element never surfaces these frames, so
 * this file parses the tag by hand.
 *
 * Everything here is fail-soft — a missing, truncated, or foreign tag yields
 * no chapters (and no cover), never a throw — because chapter navigation
 * must never break playback.
 *
 * @module lib/id3-chapters
 */

/** One navigable track inside a merged single-file album. */
export interface AudioChapter {
  /** Seek target, milliseconds from the start of the file. */
  startMs: number
  /** Track title from the chapter's `TIT2` subframe (element id, then a fallback). */
  title: string
}

/** Embedded cover art from the tag's `APIC` frame. */
export interface Id3Cover {
  mime: string
  bytes: Uint8Array
}

const ID3_HEADER_SIZE = 10
const FRAME_HEADER_SIZE = 10
const UNSYNC_FLAG = 0x80
const EXT_HEADER_FLAG = 0x40

/**
 * Largest tag region {@link readId3Tag} will pull into memory. Cover art
 * lives in the same tag, so this comfortably exceeds any real
 * chapters-plus-picture header; past it the tag is corrupt, not an album.
 */
const MAX_TAG_BYTES = 16 * 1024 * 1024

/**
 * Which chapter contains `positionMs`: the latest start at or before the
 * position. Order-free (a `CTOC` order is authoritative for display but
 * need not be time order). -1 when there are no chapters, so the UI
 * highlights nothing.
 */
export function chapterIndexAt(chapters: AudioChapter[], positionMs: number): number {
  if (chapters.length === 0) return -1
  let best = 0
  let bestStart = Number.MIN_SAFE_INTEGER
  for (let i = 0; i < chapters.length; i++) {
    const start = chapters[i]!.startMs
    if (start <= positionMs && start > bestStart) {
      best = i
      bestStart = start
    }
  }
  // A position before every start (pre-gap) still highlights the first chapter.
  return best
}

/**
 * Reads at most the ID3 tag region of a blob (header first for the size, so
 * a large album costs one small sliced read, not a load). Returns null when
 * there is no tag, it is oversized, or anything is unreadable.
 */
export async function readId3Tag(blob: Blob): Promise<Uint8Array | null> {
  try {
    const header = new Uint8Array(await blob.slice(0, ID3_HEADER_SIZE).arrayBuffer())
    if (header.length < ID3_HEADER_SIZE) return null
    if (header[0] !== 0x49 || header[1] !== 0x44 || header[2] !== 0x33) return null
    const tagSize = syncsafe(header, 6)
    if (tagSize < 0 || tagSize > MAX_TAG_BYTES) return null
    const body = new Uint8Array(await blob.slice(ID3_HEADER_SIZE, ID3_HEADER_SIZE + tagSize).arrayBuffer())
    const tag = new Uint8Array(ID3_HEADER_SIZE + body.length)
    tag.set(header, 0)
    tag.set(body, ID3_HEADER_SIZE)
    return tag
  } catch {
    return null
  }
}

/**
 * Parses ID3v2.3/v2.4 chapters out of `tag` (the tag bytes, header included).
 *
 * Understands what the pipeline writes (plain `CHAP` + one `CTOC`, UTF-8
 * `TIT2`) plus the v2.3 spelling and the global unsynchronisation /
 * extension-header flags; anything else (v2.2, compressed frames, garbage)
 * parses as no chapters.
 */
export function parseId3Chapters(tag: Uint8Array): AudioChapter[] {
  const body = tagBody(tag)
  if (!body) return []
  const { major, data } = body

  const chapters = new Map<string, ParsedChapter>()
  const tocOrders: string[][] = []
  let pos = 0
  while (pos + FRAME_HEADER_SIZE <= data.length) {
    // A zero id is tag padding (writers pad to boundaries); stop, don't scan on.
    if (data[pos] === 0) break
    const id = frameId(data, pos)
    const size = major === 3 ? u32(data, pos + 4) : syncsafe(data, pos + 4)
    const frameFlags = u16(data, pos + 8)
    const dataStart = pos + FRAME_HEADER_SIZE
    // Compression/encryption bits mean the bytes aren't frames; skip, don't misparse.
    const opaque = (frameFlags & (major === 3 ? 0x0080 | 0x0040 : 0x0008 | 0x0004)) !== 0
    if (size < 0 || dataStart + size > data.length) break
    if (!opaque && (id === 'CHAP' || id === 'CTOC')) {
      const frame = data.slice(dataStart, dataStart + size)
      if (id === 'CHAP') {
        const parsed = parseChap(frame, major)
        if (parsed) chapters.set(parsed.elementId, parsed)
      } else {
        const order = parseCtoc(frame)
        if (order) tocOrders.push(order)
      }
    }
    pos = dataStart + size
  }
  if (chapters.size === 0) return []

  const ordered = orderedChapters(chapters, tocOrders)
  return ordered.map((chapter, index) => ({
    startMs: chapter.startMs,
    title: chapter.title || chapter.elementId || `Chapter ${index + 1}`,
  }))
}

/**
 * First `APIC` (attached picture) frame in the tag, or null. Fail-soft like
 * the chapter parse: malformed picture frames read as absent.
 */
export function parseId3Cover(tag: Uint8Array): Id3Cover | null {
  const body = tagBody(tag)
  if (!body) return null
  const { major, data } = body

  let pos = 0
  while (pos + FRAME_HEADER_SIZE <= data.length) {
    if (data[pos] === 0) break
    const id = frameId(data, pos)
    const size = major === 3 ? u32(data, pos + 4) : syncsafe(data, pos + 4)
    const dataStart = pos + FRAME_HEADER_SIZE
    if (size < 0 || dataStart + size > data.length) break
    if (id === 'APIC') {
      const cover = parseApic(data.slice(dataStart, dataStart + size))
      if (cover) return cover
    }
    pos = dataStart + size
  }
  return null
}

interface ParsedChapter {
  elementId: string
  startMs: number
  title: string
}

/** Validated tag body: header checks, de-unsync, extension header skipped. */
function tagBody(tag: Uint8Array): { major: 3 | 4; data: Uint8Array } | null {
  if (tag.length < ID3_HEADER_SIZE) return null
  if (tag[0] !== 0x49 || tag[1] !== 0x44 || tag[2] !== 0x33) return null
  // v2.2 has three-letter frame ids and no CHAP frame — nothing to find.
  const major = tag[3]
  if (major !== 3 && major !== 4) return null
  const flags = tag[5]!

  const tagSize = syncsafe(tag, 6)
  let data: Uint8Array = tag.slice(ID3_HEADER_SIZE, Math.min(ID3_HEADER_SIZE + tagSize, tag.length))
  if ((flags & UNSYNC_FLAG) !== 0) data = deunsync(data)
  if ((flags & EXT_HEADER_FLAG) !== 0) {
    // v2.3 counts the size field itself, v2.4 counts only what follows it.
    const skip = major === 3 ? u32(data, 0) : syncsafe(data, 0) + 4
    if (skip < 0 || skip > data.length) return null
    data = data.slice(skip)
  }
  return { major, data }
}

/**
 * Display order: the first `CTOC` entry list wins (it is the author's order,
 * and the pipeline writes exactly one), with any chapters the table omits
 * appended by start time. No table at all means start-time order.
 */
function orderedChapters(chapters: Map<string, ParsedChapter>, tocOrders: string[][]): ParsedChapter[] {
  const order = tocOrders.find((o) => o.length > 0)
  if (!order) return [...chapters.values()].sort((a, b) => a.startMs - b.startMs)
  const listed = order.flatMap((id) => {
    const chapter = chapters.get(id)
    return chapter ? [chapter] : []
  })
  const unlisted = [...chapters.values()]
    .filter((c) => !order.includes(c.elementId))
    .sort((a, b) => a.startMs - b.startMs)
  return [...listed, ...unlisted]
}

/**
 * `CHAP`: null-terminated element id, start/end ms, start/end offsets
 * (usually unknown), then subframes — the title is the first `TIT2`. Times
 * are plain u32 even in v2.4.
 */
function parseChap(data: Uint8Array, major: 3 | 4): ParsedChapter | null {
  const elementId = cstr(data, 0)
  if (!elementId) return null
  const timesAt = elementId.end
  if (timesAt + 16 > data.length) return null
  const startMs = u32(data, timesAt)
  const subframes = data.slice(timesAt + 16)
  const title = firstTextSubframe(subframes, major, 'TIT2') ?? ''
  return { elementId: elementId.text, startMs, title }
}

/** `CTOC`: element id, one flags byte, entry count, then that many element ids. */
function parseCtoc(data: Uint8Array): string[] | null {
  const elementId = cstr(data, 0)
  if (!elementId) return null
  let pos = elementId.end
  if (pos + 2 > data.length) return null
  const count = data[pos + 1]!
  pos += 2
  const entries: string[] = []
  for (let i = 0; i < count; i++) {
    const entry = cstr(data, pos)
    if (!entry) return null
    entries.push(entry.text)
    pos = entry.end
  }
  return entries
}

/**
 * `APIC`: encoding byte, MIME c-string, picture-type byte, description
 * (encoding-dependent), then the raw picture bytes.
 */
function parseApic(data: Uint8Array): Id3Cover | null {
  if (data.length < 4) return null
  const encoding = data[0]!
  const mime = cstr(data, 1)
  if (!mime || mime.text.length === 0) return null
  let pos = mime.end + 1 // picture-type byte
  if (pos > data.length) return null
  // Description: encoding 1/2 terminate wide, the rest narrow.
  if (encoding === 1 || encoding === 2) {
    while (pos + 1 < data.length && (data[pos] !== 0 || data[pos + 1] !== 0)) pos += 2
    pos += 2
  } else {
    while (pos < data.length && data[pos] !== 0) pos += 1
    pos += 1
  }
  if (pos >= data.length) return null
  return { mime: mime.text, bytes: data.slice(pos) }
}

/** First text subframe with `wantedId` inside a `CHAP`/`CTOC` payload; null when absent. */
function firstTextSubframe(data: Uint8Array, major: 3 | 4, wantedId: string): string | null {
  let pos = 0
  while (pos + FRAME_HEADER_SIZE <= data.length) {
    if (data[pos] === 0) break
    const id = frameId(data, pos)
    const size = major === 3 ? u32(data, pos + 4) : syncsafe(data, pos + 4)
    const start = pos + FRAME_HEADER_SIZE
    if (size < 0 || start + size > data.length) break
    if (id === wantedId) return decodeText(data.slice(start, start + size))
    pos = start + size
  }
  return null
}

/**
 * ID3 text value: one encoding byte, then the string. 0 = Latin-1,
 * 1 = UTF-16 with BOM, 2 = UTF-16BE, 3 = UTF-8. Trailing nulls stripped;
 * a BOM-less UTF-16 reads as LE, the common writer mistake.
 */
function decodeText(data: Uint8Array): string {
  if (data.length === 0) return ''
  const encoding = data[0]!
  const raw = data.slice(1)
  if (encoding === 1 || encoding === 2) {
    const even = raw.slice(0, raw.length - (raw.length % 2))
    if (encoding === 1 && even.length >= 2 && even[0] === 0xff && even[1] === 0xfe) {
      return decode(even.slice(2), 'utf-16le')
    }
    if (encoding === 1 && even.length >= 2 && even[0] === 0xfe && even[1] === 0xff) {
      return decode(even.slice(2), 'utf-16be')
    }
    return decode(even, encoding === 1 ? 'utf-16le' : 'utf-16be')
  }
  return decode(raw, encoding === 3 ? 'utf-8' : 'latin1')
}

function decode(bytes: Uint8Array, encoding: string): string {
  // Vitest node <20 lacks TextDecoder globals in some configs; Buffer covers it.
  // The copy also narrows ArrayBufferLike → ArrayBuffer for TextDecoder typings.
  const text =
    typeof TextDecoder === 'undefined'
      ? Buffer.from(bytes).toString(encoding as BufferEncoding)
      : new TextDecoder(encoding).decode(new Uint8Array(bytes))
  return text.replace(/\0+$/, '')
}

/** Latin-1 C string at `from`: text plus the offset just past the null (null if unterminated). */
function cstr(data: Uint8Array, from: number): { text: string; end: number } | null {
  if (from >= data.length) return null
  let end = from
  while (end < data.length && data[end] !== 0) end++
  if (end >= data.length) return null
  let text = ''
  for (let i = from; i < end; i++) text += String.fromCharCode(data[i]!)
  return { text, end: end + 1 }
}

/** Global unsynchronisation: every `0xFF 0x00` in the tag body stands for a bare `0xFF`. */
function deunsync(body: Uint8Array): Uint8Array {
  const out = new Uint8Array(body.length)
  let read = 0
  let written = 0
  while (read < body.length) {
    const byte = body[read++]!
    out[written++] = byte
    if (byte === 0xff && read < body.length && body[read] === 0x00) read++
  }
  return out.slice(0, written)
}

function frameId(data: Uint8Array, at: number): string {
  return String.fromCharCode(data[at]!, data[at + 1]!, data[at + 2]!, data[at + 3]!)
}

function u16(data: Uint8Array, at: number): number {
  if (at < 0 || at + 2 > data.length) return 0
  return ((data[at]! << 8) | data[at + 1]!) >>> 0
}

function u32(data: Uint8Array, at: number): number {
  if (at < 0 || at + 4 > data.length) return 0
  let value = 0
  for (let i = 0; i < 4; i++) value = value * 256 + data[at + i]!
  return value
}

/** Syncsafe integer: four bytes, seven bits each — the tag header and v2.4 frame sizes. */
function syncsafe(data: Uint8Array, at: number): number {
  if (at < 0 || at + 4 > data.length) return 0
  let value = 0
  for (let i = 0; i < 4; i++) value = value * 128 + (data[at + i]! & 0x7f)
  return value
}
