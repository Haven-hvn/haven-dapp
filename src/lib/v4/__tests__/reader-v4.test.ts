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

const V4_ATTRS = {
  project: 'haven',
  type: 'video',
  title: 'Drip film',
  is_encrypted: 1,
  gate_type: 4,
  market_cap_target_usd: 5_000_000,
  drip_index: 2,
  drip_total: 3,
  drip_id: 'drip-abc',
  oracle_address: '0xc5a076cad94176c2996B32d8466Be1cE757FAa27',
  gate_token: '0xaa000000000000000000000000000000000000001',
  gate_chain: 'BaseMainnet',
}

describe('parseDripInfo', () => {
  it('parses a full v4 attribute set', () => {
    const drip = parseDripInfo(V4_ATTRS, {})
    expect(drip).toMatchObject({
      gateType: 4,
      marketCapTargetUsd: 5_000_000,
      dripIndex: 2,
      dripTotal: 3,
      dripId: 'drip-abc',
      gateToken: '0xaa000000000000000000000000000000000000001',
      gateChain: 'BaseMainnet',
    })
  })

  it('accepts camelCase payload extras as fallback', () => {
    const drip = parseDripInfo(
      {},
      {
        gateType: 4,
        marketCapTargetUsd: '250000',
        dripIndex: 0,
        dripTotal: 2,
        dripId: 'p-1',
        tokenAddress: '0xbb2',
        chain: 'EthMainnet',
      }
    )
    expect(drip?.marketCapTargetUsd).toBe(250_000)
    expect(drip?.gateToken).toBe('0xbb2')
  })

  it('returns undefined for non-v4 records (v1/v3 unaffected)', () => {
    expect(parseDripInfo({ gate_type: 3 }, {})).toBeUndefined()
    expect(parseDripInfo({}, {})).toBeUndefined()
  })

  it('returns undefined without a usable target or drip id', () => {
    expect(parseDripInfo({ ...V4_ATTRS, market_cap_target_usd: 0 }, {})).toBeUndefined()
    expect(parseDripInfo({ ...V4_ATTRS, drip_id: '' }, {})).toBeUndefined()
  })
})

describe('parseArkivEntityToVideo v4 integration', () => {
  it('maps a v4 chunk entity to Video.drip', () => {
    const video = parseArkivEntityToVideo(
      entityWith(V4_ATTRS, {
        encryption_metadata: {
          version: 4,
          cid: 'bafychunk',
          chain: 'BaseMainnet',
          tokenAddress: '0xaa00000000000000000000000000000000000001',
          threshold: '5',
          epoch: 670,
          marketCapTarget: 5_000_000,
          oracleAddress: '0xc5a076cad94176c2996b32d8466be1ce757faa27',
          encryptedAesKey: 'AAA=',
        },
        dripId: 'drip-abc',
      })
    )

    expect(video.isEncrypted).toBe(true)
    expect(video.drip?.dripIndex).toBe(2)
    expect(video.drip?.gateType).toBe(4)
    // Native v4 metadata parses through the dispatcher → decryptAnyContentKey
    // routes to the V4 canister path (market-cap gate server-side).
    expect(video.encryptionMetadata?.version).toBe(4)
  })

  it('leaves plain v3 entities drip-free', () => {
    const video = parseArkivEntityToVideo(
      entityWith(
        { project: 'haven', type: 'video', is_encrypted: 1 },
        {
          encryption_metadata: {
            version: 3,
            cid: 'bafybeiv3corpus',
            chain: 'EthSepolia',
            tokenAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbc3',
            threshold: '2',
            epoch: 670,
            encryptedAesKey: 'AAA=',
          },
        }
      )
    )
    expect(video.drip).toBeUndefined()
    expect(video.encryptionMetadata?.version).toBe(3)
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
