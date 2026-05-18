/**
 * Browser-friendly Filecoin piece download with abort, progress, and PieceCID validation.
 *
 * Synapse-core's `downloadAndValidate` uses iso-web `request.get` without AbortSignal or
 * progress callbacks. This module uses `fetch` + `createPieceCIDStream` for the same
 * validation semantics with better UX on large CAR pieces.
 *
 * @module lib/piece-download
 */

import {
  asPieceCID,
  createPieceCIDStream,
  getSizeFromPieceCID,
} from '@filoz/synapse-core/piece'

export type PieceDownloadProgressFn = (downloaded: number, total: number) => void

export interface StreamDownloadAndValidateOptions {
  url: string
  expectedPieceCid: string
  signal?: AbortSignal
  onProgress?: PieceDownloadProgressFn
}

export class PieceDownloadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PieceDownloadError'
  }
}

/**
 * Resolve expected byte length for progress (Content-Length, else size from PieceCIDv2).
 */
export function resolveExpectedPieceByteLength(
  pieceCid: string,
  contentLengthHeader: string | null
): number {
  const fromHeader = contentLengthHeader?.trim()
  if (fromHeader != null && fromHeader.length > 0) {
    const parsed = Number.parseInt(fromHeader, 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
  }

  try {
    return getSizeFromPieceCID(pieceCid)
  } catch {
    return 0
  }
}

/**
 * Download a piece from a resolved URL, validate PieceCID while streaming, return bytes.
 */
export async function streamDownloadAndValidatePiece(
  options: StreamDownloadAndValidateOptions
): Promise<Uint8Array> {
  const { url, expectedPieceCid, signal, onProgress } = options

  const parsedPieceCid = asPieceCID(expectedPieceCid)
  if (parsedPieceCid == null) {
    throw new PieceDownloadError(`Invalid piece CID: ${expectedPieceCid}`)
  }

  if (signal?.aborted) {
    throw new PieceDownloadError('Download aborted')
  }

  const response = await fetch(url, {
    method: 'GET',
    signal,
    credentials: 'omit',
    cache: 'no-store',
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new PieceDownloadError(
      `HTTP ${response.status}${detail.length > 0 ? `: ${detail.slice(0, 200)}` : ''}`
    )
  }

  if (response.body == null) {
    throw new PieceDownloadError('Response body is null')
  }

  const expectedTotal = resolveExpectedPieceByteLength(
    expectedPieceCid,
    response.headers.get('content-length')
  )
  onProgress?.(0, expectedTotal)

  const { stream: pieceCidStream, getPieceCID } = createPieceCIDStream()
  const chunks: Uint8Array[] = []
  let downloaded = 0

  const collectStream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk: Uint8Array, controller: TransformStreamDefaultController<Uint8Array>) {
      chunks.push(chunk)
      downloaded += chunk.byteLength
      onProgress?.(downloaded, expectedTotal)
      controller.enqueue(chunk)
    },
  })

  const pipelineStream = response.body
    .pipeThrough(pieceCidStream)
    .pipeThrough(collectStream)

  const reader = pipelineStream.getReader()
  try {
    while (true) {
      if (signal?.aborted) {
        throw new PieceDownloadError('Download aborted')
      }
      const { done } = await reader.read()
      if (done) break
    }
  } finally {
    reader.releaseLock()
  }

  if (chunks.length === 0) {
    throw new PieceDownloadError('Response body is empty')
  }

  const calculatedPieceCid = getPieceCID()
  if (calculatedPieceCid == null) {
    throw new PieceDownloadError('Failed to calculate PieceCID from stream')
  }

  if (calculatedPieceCid.toString() !== parsedPieceCid.toString()) {
    throw new PieceDownloadError(
      `PieceCID verification failed. Expected: ${String(parsedPieceCid)}, Got: ${String(calculatedPieceCid)}`
    )
  }

  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }

  onProgress?.(totalLength, totalLength > 0 ? totalLength : expectedTotal)
  return result
}
