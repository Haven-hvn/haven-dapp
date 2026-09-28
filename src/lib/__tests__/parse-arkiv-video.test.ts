/**
 * Regression tests for `parseArkivEntityToVideo` (ARKIV_FORMAT 2.0.0).
 *
 * The pre-Sprint-6 implementation used the v1-strict `parseGateMetadata`
 * helper for both gate fields, which returned `null` for every Haven-AOL v3
 * record. The downstream `Video` object therefore had
 * `encryptionMetadata: undefined` for v3 uploads — the dapp would then hit
 * an "Invalid encryption metadata" error or (worse) treat v3-encrypted
 * content as un-encrypted.
 *
 * These tests pin the wiring: v1 records still round-trip, v3 records flow
 * through the `parseAnyGateMetadata` dispatcher, and 2.0 canonical keys
 * (`gate`, `piece`/`fcid`, `sha256_ct`, `mime`, `dur_s`, `vlm`, `seg`,
 * `src`/`creator`, `pt_hash`) land in the `Video` object.
 *
 * @module lib/__tests__/parse-arkiv-video.test
 */

import { describe, expect, it, vi } from 'vitest'

// Mock the SDK to a minimal soft-fail dispatcher — we don't want to depend on
// the real haven-aol wasm bindings just to test the wiring in this file.
// Note: `parseAnyGateMetadata` is what `parse-arkiv-video.ts` imports.
vi.mock('../haven-aol', () => ({
  parseAnyGateMetadata: (raw: unknown) => {
    if (raw === null || raw === undefined) return null
    let parsed: unknown = raw
    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw)
      } catch {
        return null
      }
    }
    if (!parsed || typeof parsed !== 'object') return null
    const v = (parsed as { version?: unknown }).version
    if (v === 1 || v === 3) return parsed
    return null
  },
}))

// `arkiv-recency` reaches into wagmi/RPC internals in production. Stub it to
// deterministic values so the test is independent of block-time providers.
vi.mock('../arkiv-recency', () => ({
  getArkivEntityCreatedAtBlock: () => 42,
  parseVideoCreatedAt: () => new Date('2026-01-01T00:00:00Z'),
}))

vi.mock('../arkiv', () => ({
  parseEntityPayload: (payload: unknown) => payload ?? {},
}))

// Import AFTER mocks are declared.
import { parseArkivEntityToVideo, selectLiveStages } from '../parse-arkiv-video'

const V1_GATE = {
  version: 1 as const,
  cid: 'bafyv1',
  chain: 'EthMainnet' as const,
  tokenAddress: '0x0000000000000000000000000000000000000001',
  threshold: '1',
  encryptedAesKey: 'dGVzdA==',
}

const V3_GATE = {
  version: 3 as const,
  chain: 'EthMainnet' as const,
  tokenAddress: '0x0000000000000000000000000000000000000001',
  threshold: '1',
  epoch: 100,
  encryptedAesKey: 'dGVzdA==',
}

function makeEntity(overrides: {
  gate?: unknown
  cid_gate?: unknown
}) {
  return {
    key: '0x1',
    owner: '0xowner',
    payload: {
      title: 'test',
      gate: overrides.gate,
      cid_gate: overrides.cid_gate,
    },
    attributes: {},
  }
}

describe('parseArkivEntityToVideo — v3 dispatcher wiring', () => {
  it('preserves v1 gate metadata unchanged (byte-identity regression guard)', () => {
    const video = parseArkivEntityToVideo(
      makeEntity({ gate: V1_GATE }) as never
    )
    expect(video.isEncrypted).toBe(true)
    expect(video.encryptionMetadata).toEqual(V1_GATE)
  })

  it('preserves v3 gate metadata (the actual bug fix — pre-fix this dropped to undefined)', () => {
    const video = parseArkivEntityToVideo(
      makeEntity({ gate: V3_GATE }) as never
    )
    // Before the fix, this would be `undefined` because the v1-only parser
    // rejected `version: 3`. That in turn tripped the v1 `isGateMetadata`
    // guard in `encrypted-playback-prepare` and threw "Invalid encryption
    // metadata — expected Haven-AOL gate v1 (version: 1)" on every v3 file.
    expect(video.encryptionMetadata).toEqual(V3_GATE)
    expect(video.encryptionMetadata?.version).toBe(3)
  })

  it('also routes cidEncryptionMetadata through the v3 dispatcher', () => {
    const video = parseArkivEntityToVideo(
      makeEntity({
        gate: V1_GATE,
        cid_gate: V3_GATE,
      }) as never
    )
    expect(video.encryptionMetadata).toEqual(V1_GATE)
    expect(video.cidEncryptionMetadata).toEqual(V3_GATE)
  })

  it('returns undefined for unknown-version records instead of throwing', () => {
    const video = parseArkivEntityToVideo(
      makeEntity({
        gate: { version: 2, whatever: 'x' },
      }) as never
    )
    expect(video.encryptionMetadata).toBeUndefined()
    expect(video.isEncrypted).toBe(false)
  })

  it('parses JSON-string gate values (v3)', () => {
    const video = parseArkivEntityToVideo(
      makeEntity({ gate: JSON.stringify(V3_GATE) }) as never
    )
    expect(video.encryptionMetadata).toEqual(V3_GATE)
  })
})

describe('parseArkivEntityToVideo — haven.audio.full', () => {
  // Shape mirrors a live single-file v3 album entity: payload carries
  // name/ct/piece/gate, attributes carry grp/title/gate corpus — notably
  // there is no `mime` enum and no `dur_s`.
  const ALBUM_GATE = {
    version: 3 as const,
    cid: 'sha256:57568407',
    chain: 'EthSepolia' as const,
    tokenAddress: '0xF23a728b55BE576c75D98A8032982F85cBAD493E',
    threshold: '1000000000000000000',
    epoch: 690,
    encryptedAesKey: 'dGVzdA==',
  }

  function audioEntity() {
    return {
      key: '0xe68e',
      owner: '0xOWNER',
      payload: {
        name: 'test_band_test_album_1971.released.mp3.enc',
        ct: 'audio/mpeg',
        piece: 'bafkpiece',
        gate: JSON.stringify(ALBUM_GATE),
      },
      attributes: {
        grp: 'haven.audio.full',
        title: 'Test Band - Test Album (1971) [DE] (MP3, full album, chapters, cover)',
        gate_type: 3,
        gate_token: '0xf23a728b55be576c75d98a8032982f85cbad493e',
        gate_chain: 11155111,
        gate_threshold: '1000000000000000000',
        gate_epoch: 690,
        sha256_ct: '57568407',
      },
    }
  }

  it('marks audio releases and resolves the payload ct MIME', () => {
    const video = parseArkivEntityToVideo(audioEntity() as never)
    expect(video.mediaKind).toBe('audio')
    expect(video.contentMimeType).toBe('audio/mpeg')
    expect(video.isEncrypted).toBe(true)
    expect(video.encryptionMetadata).toEqual(ALBUM_GATE)
    expect(video.pieceCid).toBe('bafkpiece')
    expect(video.cidHash).toBe('57568407')
    expect(video.title).toContain('Test Album')
  })

  it('marks video releases explicitly', () => {
    const video = parseArkivEntityToVideo({
      ...audioEntity(),
      attributes: { ...audioEntity().attributes, grp: 'haven.video.full', mime: 1 },
    } as never)
    expect(video.mediaKind).toBe('video')
  })

  it('rejects a malformed ct instead of smuggling it into playback', () => {
    const video = parseArkivEntityToVideo({
      ...audioEntity(),
      payload: { ...audioEntity().payload, ct: 'not a mime' },
    } as never)
    expect(video.mediaKind).toBe('audio')
    expect(video.contentMimeType).toBeUndefined()
  })
})

describe('parseArkivEntityToVideo — 2.0 canonical keys', () => {
  it('maps full-record keys (clear)', () => {
    const video = parseArkivEntityToVideo({
      key: '0x2',
      owner: '0xOWNER',
      payload: {
        fcid: 'QmRoot',
        size: 1024,
        vlm: 'QmVlm',
        vlm_model: 'zai-org/glm-4.6v-flash',
        src: 'https://example.com/v.mp4',
        creator: '@alice',
        phash: 'abc123',
        codecs: ['h264'],
        seg: {
          segment_index: 1,
          start_timestamp: '2026-02-20T10:00:00Z',
          mint_id: 'mint-9',
        },
      },
      attributes: {
        grp: 'haven.video.full',
        title: 'hello',
        mime: 1,
        dur_s: 125,
        sha256_ct: 'de'.repeat(32),
      },
    } as never)

    expect(video.title).toBe('hello')
    expect(video.owner).toBe('0xowner')
    expect(video.filecoinCid).toBe('QmRoot')
    expect(video.pieceCid).toBeUndefined()
    expect(video.isEncrypted).toBe(false)
    expect(video.contentMimeType).toBe('video/mp4')
    expect(video.duration).toBe(125)
    expect(video.hasAiData).toBe(true)
    expect(video.vlmJsonCid).toBe('QmVlm')
    expect(video.analysisModel).toBe('zai-org/glm-4.6v-flash')
    expect(video.sourceUri).toBe('https://example.com/v.mp4')
    expect(video.creatorHandle).toBe('@alice')
    expect(video.phash).toBe('abc123')
    expect(video.cidHash).toBe('de'.repeat(32))
    expect(video.mintId).toBe('mint-9')
    expect(video.segmentMetadata?.segmentIndex).toBe(1)
    expect(video.codecVariants?.[0]?.codec).toBe('h264')
  })

  it('reads no legacy keys', () => {
    const video = parseArkivEntityToVideo({
      key: '0x3',
      owner: '0xowner',
      payload: {
        filecoin_root_cid: 'QmLegacy',
        encryption_metadata: V1_GATE,
        is_encrypted: true,
        content_mime_type: 'video/mp4',
      },
      attributes: {
        title: 'legacy',
        cid_hash: '00'.repeat(32),
        duration: 99,
        creator_handle: '@ghost',
      },
    } as never)

    expect(video.filecoinCid).toBe('')
    expect(video.encryptionMetadata).toBeUndefined()
    expect(video.isEncrypted).toBe(false)
    expect(video.contentMimeType).toBeUndefined()
    expect(video.duration).toBe(0)
    expect(video.creatorHandle).toBeUndefined()
    expect(video.cidHash).toBeUndefined()
  })
})

describe('selectLiveStages', () => {
  const stage = (dripId: string, dripIndex: number) => ({ dripId, dripIndex })

  it('keeps a fully contiguous launch', () => {
    const items = [stage('a', 0), stage('a', 1), stage('a', 2)]
    expect(selectLiveStages(items)).toEqual(items)
  })

  it('truncates stages past the first gap', () => {
    const items = [stage('a', 0), stage('a', 1), stage('a', 3), stage('a', 4)]
    expect(selectLiveStages(items)).toEqual([stage('a', 0), stage('a', 1)])
  })

  it('drops a launch missing stage 0 entirely', () => {
    const items = [stage('a', 1), stage('a', 2)]
    expect(selectLiveStages(items)).toEqual([])
  })

  it('treats each launch independently and preserves input order', () => {
    const items = [stage('b', 1), stage('a', 0), stage('b', 0), stage('a', 1)]
    expect(selectLiveStages(items)).toEqual(items)
  })

  it('ignores duplicate, negative, and non-integer indexes', () => {
    const s0 = stage('a', 0)
    const items = [s0, stage('a', 0), stage('a', -1), stage('a', 1.5), stage('a', 1)]
    expect(selectLiveStages(items)).toEqual([s0, stage('a', 1)])
  })
})
