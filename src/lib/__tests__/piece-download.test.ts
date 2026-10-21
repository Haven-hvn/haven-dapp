import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PieceDownloadError,
  resolveExpectedPieceByteLength,
  streamDownloadPiece,
} from '../piece-download'

const PIECE =
  'bafkzcibf7ptzggiwddrd4cwnoazqf2tx5xw2ecrsvbcoafw3cg33o5k2akri3i5pamkq'

function makeStream(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let index = 0
  return new ReadableStream({
    pull(controller) {
      if (index >= chunks.length) {
        controller.close()
        return
      }
      controller.enqueue(chunks[index])
      index += 1
    },
  })
}

describe('resolveExpectedPieceByteLength', () => {
  it('prefers Content-Length when present', () => {
    expect(resolveExpectedPieceByteLength(PIECE, '12345')).toBe(12345)
  })

  it('falls back to PieceCID size when header missing', () => {
    const size = resolveExpectedPieceByteLength(PIECE, null)
    expect(size).toBeGreaterThan(0)
  })
})

describe('streamDownloadPiece', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('throws on invalid piece CID', async () => {
    await expect(
      streamDownloadPiece({
        url: 'https://example.com/x',
        expectedPieceCid: 'not-a-piece',
      })
    ).rejects.toBeInstanceOf(PieceDownloadError)
  })

  it('throws when fetch is aborted before response', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      streamDownloadPiece({
        url: 'https://example.com/x',
        expectedPieceCid: PIECE,
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ message: 'Download aborted' })
  })

  it('rejects HTTP errors', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response('missing', { status: 404, statusText: 'Not Found' })
    )

    await expect(
      streamDownloadPiece({
        url: 'https://example.com/missing',
        expectedPieceCid: PIECE,
      })
    ).rejects.toThrow(/HTTP 404/)
  })

  it('downloads with progress', async () => {
    const payload = new Uint8Array([9, 8, 7, 6, 5])
    const { calculate } = await import('@filoz/synapse-core/piece')
    const pieceCid = (await calculate(payload)).toString()

    const progressCalls: number[] = []
    global.fetch = vi.fn().mockResolvedValue(
      new Response(makeStream([payload]), {
        status: 200,
        headers: { 'Content-Length': String(payload.byteLength) },
      })
    )

    const data = await streamDownloadPiece({
      url: 'https://example.com/ok',
      expectedPieceCid: pieceCid,
      onProgress: (downloaded) => {
        progressCalls.push(downloaded)
      },
    })

    expect(data).toEqual(payload)
    expect(progressCalls.length).toBeGreaterThan(0)
    expect(progressCalls[progressCalls.length - 1]).toBe(payload.byteLength)
  })

  it('returns served bytes without re-hashing against the PieceCID', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(makeStream([new Uint8Array([1, 2, 3])]), {
        status: 200,
        headers: { 'Content-Length': '3' },
      })
    )

    // Content is trusted by CID addressing (sealed bytes are authenticated
    // by the AES-GCM open); the download itself does not re-verify.
    await expect(
      streamDownloadPiece({
        url: 'https://example.com/wrong',
        expectedPieceCid: PIECE,
      })
    ).resolves.toEqual(new Uint8Array([1, 2, 3]))
  })
})
