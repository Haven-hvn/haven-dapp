/**
 * Regression tests for `parseArkivEntityToVideo`.
 *
 * The pre-Sprint-6 implementation used the v1-strict `parseGateMetadata`
 * helper for both `encryption_metadata` and `cid_encryption_metadata`, which
 * returned `null` for every Haven-AOL v3 record. The downstream `Video` object
 * therefore had `encryptionMetadata: undefined` for v3 uploads — the dapp
 * would then hit an "Invalid encryption metadata" error or (worse) treat
 * v3-encrypted content as un-encrypted.
 *
 * These tests pin the fix: v1 records still round-trip byte-identically, and
 * v3 records now flow through the `parseAnyGateMetadata` dispatcher and land
 * in the `Video` object unchanged.
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
import { parseArkivEntityToVideo } from '../parse-arkiv-video'

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
  encryption_metadata?: unknown
  cid_encryption_metadata?: unknown
  is_encrypted?: boolean
}) {
  return {
    key: '0x1',
    owner: '0xowner',
    payload: {
      title: 'test',
      is_encrypted: overrides.is_encrypted ?? true,
      encryption_metadata: overrides.encryption_metadata,
      cid_encryption_metadata: overrides.cid_encryption_metadata,
    },
    attributes: {},
  }
}

describe('parseArkivEntityToVideo — v3 dispatcher wiring', () => {
  it('preserves v1 gate metadata unchanged (byte-identity regression guard)', () => {
    const video = parseArkivEntityToVideo(
      makeEntity({ encryption_metadata: V1_GATE }) as never
    )
    expect(video.isEncrypted).toBe(true)
    expect(video.encryptionMetadata).toEqual(V1_GATE)
  })

  it('preserves v3 gate metadata (the actual bug fix — pre-fix this dropped to undefined)', () => {
    const video = parseArkivEntityToVideo(
      makeEntity({ encryption_metadata: V3_GATE }) as never
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
        encryption_metadata: V1_GATE,
        cid_encryption_metadata: V3_GATE,
      }) as never
    )
    expect(video.encryptionMetadata).toEqual(V1_GATE)
    expect(video.cidEncryptionMetadata).toEqual(V3_GATE)
  })

  it('returns undefined for unknown-version records instead of throwing', () => {
    const video = parseArkivEntityToVideo(
      makeEntity({
        encryption_metadata: { version: 2, whatever: 'x' },
      }) as never
    )
    expect(video.encryptionMetadata).toBeUndefined()
  })

  it('parses JSON-string encryption_metadata values (v3)', () => {
    const video = parseArkivEntityToVideo(
      makeEntity({ encryption_metadata: JSON.stringify(V3_GATE) }) as never
    )
    expect(video.encryptionMetadata).toEqual(V3_GATE)
  })
})
