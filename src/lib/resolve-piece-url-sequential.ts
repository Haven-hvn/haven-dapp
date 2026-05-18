/**
 * Sequential piece URL resolution (avoids pSome aborting in-flight resolver work).
 *
 * @module lib/resolve-piece-url-sequential
 */

import type { resolvePieceUrl as ResolvePieceUrlTypes } from '@filoz/synapse-core/piece'

export type PieceUrlResolver = ResolvePieceUrlTypes.ResolverFnType

export type ResolvePieceUrlSequentialOptions = {
  address: `0x${string}`
  client: ResolvePieceUrlTypes.ResolvePieceUrlOptions['client']
  pieceCid: NonNullable<ReturnType<typeof import('@filoz/synapse-core/piece').asPieceCID>>
  resolvers: PieceUrlResolver[]
  signal?: AbortSignal
}

/**
 * Try resolvers in order; first successful URL wins. Does not abort sibling attempts.
 */
export async function resolvePieceUrlSequential(
  options: ResolvePieceUrlSequentialOptions
): Promise<string> {
  const { resolvers, signal, ...rest } = options
  const failures: Error[] = []

  for (const resolver of resolvers) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
    try {
      return await resolver({
        ...rest,
        signal,
      })
    } catch (error) {
      failures.push(error instanceof Error ? error : new Error(String(error)))
    }
  }

  const summary = failures.map((e) => e.message).join('; ')
  throw new Error(
    failures.length > 0
      ? `All piece URL resolvers failed: ${summary}`
      : 'No piece URL resolvers configured'
  )
}

export function isFilbeamRetrievalUrl(url: string): boolean {
  return url.toLowerCase().includes('filbeam')
}
