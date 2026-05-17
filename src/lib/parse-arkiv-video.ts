/**
 * Parse Arkiv entities into {@link Video} records.
 *
 * @module lib/parse-arkiv-video
 */

import type { Video } from '../types/video'
import {
  parseGateMetadata,
  parseCidEncryptionMetadata,
} from './haven-aol'
import { parseEntityPayload, type ArkivEntity } from './arkiv'
import {
  getArkivEntityCreatedAtBlock,
  parseVideoCreatedAt,
} from './arkiv-recency'

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

  const encryptionMeta =
    parseGateMetadata(get('encryption_metadata')) ?? undefined

  const rawSegment = (get('segment_metadata') as Record<string, unknown>) || null
  const segmentMetadata = rawSegment
    ? {
        startTimestamp: new Date(
          (rawSegment.start_timestamp as string) || ''
        ),
        endTimestamp: rawSegment.end_timestamp
          ? new Date(rawSegment.end_timestamp as string)
          : undefined,
        segmentIndex: (rawSegment.segment_index as number) ?? 0,
        totalSegments: (rawSegment.total_segments as number) ?? 0,
        mintId: (rawSegment.mint_id as string) ?? '',
        recordingSessionId: rawSegment.recording_session_id as string | undefined,
      }
    : undefined

  const vlmJsonCid = (get('vlm_json_cid') as string) || undefined
  const createdAtBlock = getArkivEntityCreatedAtBlock(entity)

  return {
    id: entity.key,
    owner: (entity.owner || '').toLowerCase(),

    title: (data.title as string) || 'Untitled',
    description: (data.description as string) || '',
    duration: (data.duration as number) || 0,

    filecoinCid: (get('filecoin_root_cid') as string) || '',
    pieceCid: (get('piece_cid') as string) || undefined,
    encryptedCid: (get('encrypted_cid') as string) || undefined,

    isEncrypted: Boolean(get('is_encrypted')),
    encryptionMetadata: encryptionMeta,

    cidEncryptionMetadata:
      parseCidEncryptionMetadata(get('cid_encryption_metadata')) ?? undefined,

    contentMimeType: (get('content_mime_type') as string) || undefined,
    originalHash: (get('original_hash') as string) || undefined,

    hasAiData: Boolean(get('has_ai_data') || vlmJsonCid),
    vlmJsonCid,

    mintId: (get('mint_id') as string) || undefined,

    sourceUri: (get('source_uri') as string) || undefined,
    creatorHandle: (get('creator_handle') as string) || undefined,

    createdAtBlock,
    createdAt: parseVideoCreatedAt(data, createdAtBlock),
    updatedAt: (get('updated_at') as string)
      ? new Date(get('updated_at') as string)
      : undefined,

    codecVariants: (get('codec_variants') as Video['codecVariants']) || undefined,

    segmentMetadata,

    phash: (get('phash') as string) || undefined,
    analysisModel: (get('analysis_model') as string) || undefined,
    cidHash: (get('cid_hash') as string) || undefined,

    arkivStatus: 'active',

    expiresAtBlock: (get('expires_at_block') as number)
      ? Number(get('expires_at_block'))
      : undefined,
  }
}
