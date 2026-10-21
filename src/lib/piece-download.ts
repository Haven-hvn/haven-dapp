/**
 * Browser-friendly Filecoin piece download with abort and progress.
 *
 * Bytes are trusted by content addressing: the piece CID is the address,
 * and sealed content is authenticated by the AES-GCM open that follows.
 * No PieceCID re-computation happens here — Synapse-core's validating
 * download lacks AbortSignal/progress, and re-hashing large pieces on
 * every fetch costs a full extra pass for a check the address (and, for
 * sealed content, GCM) already provides.
 *
 * @module lib/piece-download
 */

import { tryFrom as pieceCIDTryFrom } from '@filoz/synapse-core/piece'

export type PieceDownloadProgressFn = (downloaded: number, total: number) => void

export interface StreamDownloadAndValidateOptions {
  url: string
  expectedPieceCid: string
  signal?: AbortSignal
  onProgress?: PieceDownloadProgressFn
}

export type PieceDownloadErrorCode =
  | 'VERIFICATION_FAILED'
  | 'DOWNLOAD_FAILED'

export class PieceDownloadError extends Error {
  readonly code: PieceDownloadErrorCode

  constructor(message: string, code: PieceDownloadErrorCode = 'DOWNLOAD_FAILED') {
    super(message)
    this.name = 'PieceDownloadError'
    this.code = code
  }
}

/** True when an error (e.g. from the SDK's own validating download) reports a PieceCID mismatch. */
export function isPieceCidVerificationFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.toLowerCase().includes('piececid verification failed')
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
    return Number(pieceCIDTryFrom(pieceCid)?.paddedSize ?? 0)
  } catch {
    return 0
  }
}

/**
 * Download a piece from a resolved URL, streaming with progress, return bytes.
 * The CID is parsed only to size progress expectations; bytes are not re-hashed.
 */
export async function streamDownloadPiece(
  options: StreamDownloadAndValidateOptions
): Promise<Uint8Array> {
  const { url, expectedPieceCid, signal, onProgress } = options

  const parsedPieceCid = pieceCIDTryFrom(expectedPieceCid)
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

  const chunks: Uint8Array[] = []
  let downloaded = 0

  const reader = response.body.getReader()
  try {
    while (true) {
      if (signal?.aborted) {
        throw new PieceDownloadError('Download aborted')
      }
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      downloaded += value.byteLength
      onProgress?.(downloaded, expectedTotal)
    }
  } finally {
    reader.releaseLock()
  }

  if (chunks.length === 0) {
    throw new PieceDownloadError('Response body is empty')
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
