/**
 * Parse Arkiv entities into {@link Video} records (ARKIV_FORMAT 2.0.0).
 *
 * Canonical snake_case keys only — no camelCase fallbacks, no legacy keys.
 * Attributes and the decoded payload merge into one record; the payload
 * never mirrors attributes.
 *
 * @module lib/parse-arkiv-video
 */

import type { Video } from '../types/video'
import type { DripInfo, VideoCodec } from '@/types/video'
import { parseAnyGateMetadata } from './haven-aol'
import { isKnownBondAddress } from './v4/market-cap'
import { parseEntityPayload, type ArkivEntity } from './arkiv'
import {
  getArkivEntityCreatedAtBlock,
  parseVideoCreatedAt,
} from './arkiv-recency'
import { toChainVariant } from './gate-chains'
import { enumToMime } from './mime-enum'

/** Series-header overlay for drip parts (one fetch per `drip_id`). */
export interface DripSeriesMeta {
  title?: string
  dripTotal?: number
  gateToken?: string
  /** Haven-AOL variant or EIP id — resolved to the variant. */
  gateChain?: string | number
}

/**
 * Parse V4 drip fields from part attributes + series overlay.
 *
 * Parts carry per-stage facts (`drip_id`, `drip_idx`, `mcap_usd`,
 * `series_ref`); shared facts (title, total, token, chain) come from the
 * series header. `gate_type` is numeric only: 4 = per-marketcap.
 *
 * When the part payload is available, the sealed consensus target rides
 * along from the payload's gate record — but ONLY when its oracle is a
 * known Bond contract (whole ETH the canister enforces). Anything else
 * (absent payload, unparseable gate, non-Bond oracle) leaves the sealed
 * fields off and callers display the USD intent.
 */
export function parseDripInfo(
  data: Record<string, unknown>,
  payloadData: Record<string, unknown>,
  series?: DripSeriesMeta
): DripInfo | undefined {
  const gateType = Number(data['gate_type'])
  if (gateType !== 4) return undefined

  const target = Number(data['mcap_usd'])
  const dripIndex = Number(data['drip_idx'] ?? 0)
  const dripId = String(data['drip_id'] ?? '')
  const seriesRef = String(data['series_ref'] ?? '')

  if (!Number.isFinite(target) || target <= 0 || !dripId) return undefined

  const dripTotal =
    Number(series?.dripTotal) ||
    1

  const gateToken = String(series?.gateToken ?? '')
  const variant = toChainVariant(series?.gateChain)

  let sealed: { marketCapTarget: number; targetUnit: 'usd' | 'reserve' } | undefined
  try {
    const gate = parseAnyGateMetadata(
      (payloadData as Record<string, unknown> | undefined)?.['gate']
    )
    if (
      gate !== null &&
      typeof gate === 'object' &&
      (gate as { version?: unknown }).version === 4
    ) {
      const v4 = gate as { marketCapTarget?: unknown; oracleAddress?: unknown }
      if (
        typeof v4.marketCapTarget === 'number' &&
        Number.isSafeInteger(v4.marketCapTarget) &&
        v4.marketCapTarget > 0 &&
        typeof v4.oracleAddress === 'string' &&
        isKnownBondAddress(v4.oracleAddress)
      ) {
        sealed = { marketCapTarget: v4.marketCapTarget, targetUnit: 'reserve' }
      }
    }
  } catch {
    // Payload gate unreadable — USD intent display below. Never throw.
  }

  return {
    gateType: 4,
    marketCapTargetUsd: target,
    ...(sealed ?? {}),
    dripIndex: Number.isFinite(dripIndex) ? dripIndex : 0,
    dripTotal: Number.isFinite(dripTotal) && dripTotal > 0 ? dripTotal : 1,
    dripId,
    gateToken,
    gateChain: variant,
    seriesRef: seriesRef || undefined,
  }
}


/**
 * Parse an Arkiv entity into a Video object.
 */
export function parseArkivEntityToVideo(entity: ArkivEntity): Video {
  const payloadData = parseEntityPayload<Record<string, unknown>>(entity.payload) || {}

  const data: Record<string, unknown> = {
    ...entity.attributes,
    ...payloadData,
  }

  const get = (key: string): unknown => data[key]

  // Sprint-5+: use the v1/v3 dispatcher so v3 records (`version: 3`) survive
  // Arkiv → Video parsing. The v1-strict `parseGateMetadata` used previously
  // returned `null` for every v3 record, silently dropping `encryptionMetadata`
  // and preventing downstream decrypt from ever seeing v3 gates.
  // 2.0: the content gate lives under `gate` (was `encryption_metadata`).
  const encryptionMeta =
    parseAnyGateMetadata(get('gate')) ?? undefined


  const rawSegment = (get('seg') as Record<string, unknown>) || null
  const segmentMetadata = rawSegment
    ? {
        startTimestamp: new Date(
          (rawSegment.start_timestamp as string) || ''
        ),
        endTimestamp: rawSegment.end_timestamp
          ? new Date(rawSegment.end_timestamp as string)
          : undefined,
        segmentIndex: (rawSegment.segment_index as number) ?? 0,
        totalSegments: 0,
        mintId: (rawSegment.mint_id as string) ?? '',
        recordingSessionId: rawSegment.recording_session_id as string | undefined,
      }
    : undefined

  const vlmJsonCid = (get('vlm') as string) || undefined
  const createdAtBlock = getArkivEntityCreatedAtBlock(entity)
  const drip = parseDripInfo(data, payloadData)

  const codecs = get('codecs')
  const codecNames = Array.isArray(codecs)
    ? codecs.filter((c): c is string => typeof c === 'string')
    : []

  return {
    id: entity.key,
    owner: (entity.owner || '').toLowerCase(),

    title: (data.title as string) || 'Untitled',
    description: '',
    duration: (data.dur_s as number) || 0,

    filecoinCid: (get('fcid') as string) || '',
    pieceCid: (get('piece') as string) || undefined,

    // Gate presence decides encryption — 2.0 carries no is_encrypted flag.
    isEncrypted: encryptionMeta !== undefined,
    encryptionMetadata: encryptionMeta,
    drip,

    cidEncryptionMetadata:
      parseAnyGateMetadata(get('cid_gate')) ?? undefined,


    contentMimeType: enumToMime(get('mime')),
    originalHash: (get('pt_hash') as string) || undefined,

    hasAiData: Boolean(vlmJsonCid),
    vlmJsonCid,

    mintId: (rawSegment?.mint_id as string) || undefined,

    sourceUri: (get('src') as string) || undefined,
    creatorHandle: (get('creator') as string) || undefined,

    createdAtBlock,
    createdAt: parseVideoCreatedAt(data, createdAtBlock),
    updatedAt: undefined,

    codecVariants: codecNames.length > 0
      ? codecNames.map((codec) => ({
          codec: codec as VideoCodec,
          cid: '',
          qualityScore: 0,
        }))
      : undefined,

    segmentMetadata,

    phash: (get('phash') as string) || undefined,
    analysisModel: (get('vlm_model') as string) || undefined,
    cidHash: (get('sha256_ct') as string) || undefined,

    arkivStatus: 'active',

    expiresAtBlock: undefined,
  }
}
