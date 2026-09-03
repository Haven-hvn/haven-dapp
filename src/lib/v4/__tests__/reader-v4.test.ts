/**
 * V4 reader-side tests — drip info parsing + unlock evaluation.
 *
 * @module lib/v4/__tests__/reader-v4
 */

import { describe, it, expect } from 'vitest'
import { parseArkivEntityToVideo, parseDripInfo } from '../../parse-arkiv-video'
import type { ArkivEntity } from '../../arkiv'
import { evaluateDripUnlock } from '@/hooks/useMarketCap'
import { jsonToPayload } from '@arkiv-network/sdk/utils'

function entityWith(
  attrs: Record<string, string | number>,
  payload: Record<string, unknown>
): ArkivEntity {
  // Mirrors the POST-transform shape produced by lib/arkiv.transformEntity:
  // attributes are already a flat record, payload is base64 JSON.
  return {
    key: '0xabc',
    owner: '0xowner',
    attributes: attrs,
    payload: Buffer.from(JSON.stringify(payload)).toString('base64'),
    content_type: 'application/json',
    created_at: '100',
    created_at_block: 100,
  } as unknown as ArkivEntity
}

const SERIES = {
  title: 'Drip film',
  dripTotal: 3,
  gateToken: '0xaa000000000000000000000000000000000000001',
  gateChain: 'BaseMainnet',
}

const V4_PART_ATTRS = {
  grp: 'haven.video.drip.part',
  gate_type: 4,
  mcap_usd: 5_000_000,
  drip_idx: 2,
  drip_id: 'drip-abc',
  series_ref: '0xseries',
  sha256_ct: 'ab'.repeat(32),
}

describe('parseDripInfo', () => {
  it('parses part attrs overlaid with the series header', () => {
    const drip = parseDripInfo(V4_PART_ATTRS, {}, SERIES)
    expect(drip).toMatchObject({
      gateType: 4,
      marketCapTargetUsd: 5_000_000,
      dripIndex: 2,
      dripTotal: 3,
      dripId: 'drip-abc',
      gateToken: '0xaa000000000000000000000000000000000000001',
      gateChain: 'BaseMainnet',
      seriesRef: '0xseries',
    })
  })

  it('resolves EIP chain ids from the series to variants', () => {
    const drip = parseDripInfo(V4_PART_ATTRS, {}, { ...SERIES, gateChain: 8453 })
    expect(drip?.gateChain).toBe('BaseMainnet')
  })

  it('defaults the series overlay when absent', () => {
    const drip = parseDripInfo(V4_PART_ATTRS, {})
    expect(drip?.dripTotal).toBe(1)
    expect(drip?.gateToken).toBe('')
    expect(drip?.gateChain).toBeUndefined()
  })

  it('returns undefined for non-v4 records (v1/v3 unaffected)', () => {
    expect(parseDripInfo({ gate_type: 3 }, {})).toBeUndefined()
    expect(parseDripInfo({ gate_type: 1 }, {})).toBeUndefined()
    expect(parseDripInfo({}, {})).toBeUndefined()
  })

  it('returns undefined without a usable target or drip id', () => {
    expect(parseDripInfo({ ...V4_PART_ATTRS, mcap_usd: 0 }, {}, SERIES)).toBeUndefined()
    expect(parseDripInfo({ ...V4_PART_ATTRS, drip_id: '' }, {}, SERIES)).toBeUndefined()
  })

  it('ignores legacy keys (no fallback reads)', () => {
    expect(
      parseDripInfo(
        {
          gate_type: 4,
          market_cap_target_usd: 5_000_000,
          drip_index: 2,
          drip_id: 'drip-abc',
        },
        {}
      )
    ).toBeUndefined()
  })
})

describe('parseArkivEntityToVideo v4 integration', () => {
  it('maps a v4 part entity to Video.drip', () => {
    const video = parseArkivEntityToVideo(
      entityWith(V4_PART_ATTRS, {
        piece: 'bafychunk',
        gate: JSON.stringify({
          version: 4,
          cid: 'bafychunk',
          chain: 'BaseMainnet',
          tokenAddress: '0xaa00000000000000000000000000000000000001',
          threshold: '5',
          epoch: 670,
          marketCapTarget: 5_000_000,
          oracleAddress: '0xc5a076cad94176c2996b32d8466be1ce757faa27',
          encryptedAesKey: 'AAA=',
        }),
      })
    )

    expect(video.isEncrypted).toBe(true)
    expect(video.drip?.dripIndex).toBe(2)
    expect(video.drip?.gateType).toBe(4)
    expect(video.pieceCid).toBe('bafychunk')
    // Native v4 metadata parses through the dispatcher → decryptAnyContentKey
    // routes to the V4 canister path (market-cap gate server-side).
    expect(video.encryptionMetadata?.version).toBe(4)
  })

  it('leaves plain v3 entities drip-free', () => {
    const video = parseArkivEntityToVideo(
      entityWith(
        {
          grp: 'haven.video.full',
          title: 'v3 film',
          gate_type: 3,
          gate_token: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbc3',
          gate_chain: 11155111,
          gate_threshold: 2,
          gate_epoch: 670,
          sha256_ct: 'cd'.repeat(32),
          mime: 1,
          dur_s: 300,
        },
        {
          gate: JSON.stringify({
            version: 3,
            cid: 'bafybeiv3corpus',
            chain: 'EthSepolia',
            tokenAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbc3',
            threshold: '2',
            epoch: 670,
            encryptedAesKey: 'AAA=',
          }),
        }
      )
    )
    expect(video.drip).toBeUndefined()
    expect(video.encryptionMetadata?.version).toBe(3)
    expect(video.isEncrypted).toBe(true)
    expect(video.contentMimeType).toBe('video/mp4')
    expect(video.duration).toBe(300)
  })
})

describe('evaluateDripUnlock (fail-closed)', () => {
  it('unlocks only at or above the target', () => {
    expect(evaluateDripUnlock(1_000_000, 999_999).unlocked).toBe(false)
    expect(evaluateDripUnlock(1_000_000, 1_000_000).unlocked).toBe(true)
    expect(evaluateDripUnlock(1_000_000, 5_000_000).unlocked).toBe(true)
  })

  it('treats unknown cap as locked with null progress', () => {
    expect(evaluateDripUnlock(1_000_000, null)).toEqual({
      unlocked: false,
      progress: null,
    })
    expect(evaluateDripUnlock(1_000_000, undefined)).toEqual({
      unlocked: false,
      progress: null,
    })
  })

  it('clamps progress to [0, 1]', () => {
    expect(evaluateDripUnlock(1_000_000, 500_000).progress).toBeCloseTo(0.5)
    expect(evaluateDripUnlock(1_000_000, 4_000_000).progress).toBe(1)
    expect(evaluateDripUnlock(1_000_000, -10).progress).toBe(0)
  })

  it('rejects invalid targets', () => {
    expect(evaluateDripUnlock(0, 1e9)).toEqual({ unlocked: false, progress: null })
    expect(evaluateDripUnlock(NaN, 1e9)).toEqual({ unlocked: false, progress: null })
  })
})

// Keep the arkiv payload codec import honest (used by publish path).
describe('jsonToPayload roundtrip', () => {
  it('encodes JSON payloads as UTF-8 bytes', () => {
    const bytes = jsonToPayload({ version: 1 })
    expect(new TextDecoder().decode(bytes)).toBe('{"version":1}')
  })
})
