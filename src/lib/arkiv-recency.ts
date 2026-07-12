/**
 * Arkiv entity recency helpers — use $createdAtBlock as the canonical ordering key.
 *
 * @module lib/arkiv-recency
 */

import type { Video } from '../types/video'
import type { ArkivEntity } from './arkiv'

/**
 * Parse `$createdAtBlock` from wire values (SDK bigint, number, or decimal string).
 */
export function parseCreatedAtBlock(raw: string | number | bigint | undefined | null): number {
  if (raw === undefined || raw === null || raw === '') {
    return 0
  }
  if (typeof raw === 'bigint') {
    return Number(raw)
  }
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : 0
  }
  const parsed = Number.parseInt(String(raw), 10)
  return Number.isNaN(parsed) ? 0 : parsed
}

/**
 * Read creation block from a transformed {@link ArkivEntity}.
 */
export function getArkivEntityCreatedAtBlock(entity: ArkivEntity): number {
  if (entity.created_at_block > 0) {
    return entity.created_at_block
  }
  return parseCreatedAtBlock(entity.created_at)
}

/**
 * Pick the entity with the highest `$createdAtBlock`.
 */
export function pickLatestArkivEntity(entities: ArkivEntity[]): ArkivEntity | null {
  if (entities.length === 0) {
    return null
  }
  return entities.reduce((latest, current) =>
    getArkivEntityCreatedAtBlock(current) > getArkivEntityCreatedAtBlock(latest)
      ? current
      : latest
  )
}

/**
 * Creation block on a {@link Video} (0 when unknown, e.g. legacy cache rows).
 */
export function getVideoCreatedAtBlock(video: Video): number {
  return video.createdAtBlock ?? 0
}

/**
 * Sort videos newest-first: `createdAtBlock` desc, then `createdAt` desc.
 */
export function compareVideosByRecency(a: Video, b: Video): number {
  const blockDiff = getVideoCreatedAtBlock(b) - getVideoCreatedAtBlock(a)
  if (blockDiff !== 0) {
    return blockDiff
  }
  return b.createdAt.getTime() - a.createdAt.getTime()
}

/**
 * Resolve a display `Date` from Arkiv attributes, avoiding `new Date(blockNumber)`.
 */
export function parseVideoCreatedAt(
  data: Record<string, unknown>,
  createdAtBlock: number
): Date {
  const raw = data.created_at ?? data.createdAt
  if (typeof raw === 'string' && raw.length > 0 && !/^\d+$/.test(raw)) {
    const parsed = new Date(raw)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed
    }
  }
  if (typeof raw === 'number' && raw > 1_000_000_000_000) {
    return new Date(raw)
  }
  if (createdAtBlock > 0) {
    return new Date(createdAtBlock)
  }
  return new Date()
}
