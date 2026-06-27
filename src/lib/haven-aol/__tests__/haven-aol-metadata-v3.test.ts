/**
 * Vitest — Sprint 5 — v1/v3 metadata dispatcher.
 *
 * Pins the dapp-side `parseAnyGateMetadata` behavior:
 *   • v1 records return unchanged (byte-identity with existing v1 callers).
 *   • v3 records validate via the SDK and return the canonical shape.
 *   • Unknown / malformed records return null (soft-fail).
 *   • Boolean `version` is rejected (`true === 1` Python-like trap).
 */

import { describe, it, expect } from 'vitest'
import {
  GATE_METADATA_VERSION,
  GATE_METADATA_VERSION_V3,
  isGateMetadata,
  isGateMetadataV3,
  parseGateMetadata,
  parseGateMetadataV3,
  parseAnyGateMetadata,
  type GateMetadataJson,
  type GateMetadataV3Json,
} from '../haven-aol-metadata'

const SAMPLE_TOKEN = '0x1234567890abcdef1234567890abcdef12345678'

function sampleV1(overrides: Partial<GateMetadataJson> = {}): GateMetadataJson {
  return {
    version: GATE_METADATA_VERSION,
    cid: 'bafyencrypted',
    chain: 'EthMainnet',
    tokenAddress: SAMPLE_TOKEN,
    threshold: '1',
    encryptedAesKey: 'encrypted-key-b64',
    ...overrides,
  }
}

function sampleV3(overrides: Partial<GateMetadataV3Json> = {}): GateMetadataV3Json {
  return {
    version: GATE_METADATA_VERSION_V3,
    cid: 'bafyencrypted',
    chain: 'EthMainnet',
    tokenAddress: SAMPLE_TOKEN,
    threshold: '1',
    epoch: 100,
    encryptedAesKey: 'ZW5jcnlwdGVkLWtleS1iNjQ=', // base64 of "encrypted-key-b64"
    ...overrides,
  }
}

describe('parseGateMetadata (v1, frozen)', () => {
  it('still parses v1 objects unchanged', () => {
    const gate = sampleV1()
    expect(parseGateMetadata(gate)).toEqual(gate)
  })

  it('parses v1 JSON strings unchanged', () => {
    const gate = sampleV1({ cid: 'QmAnother' })
    expect(parseGateMetadata(JSON.stringify(gate))).toEqual(gate)
  })

  it('returns null for v3 records (v1 parser is strict)', () => {
    expect(parseGateMetadata(sampleV3())).toBeNull()
  })
})

describe('parseGateMetadataV3 (SDK re-export)', () => {
  it('parses valid v3 records', () => {
    const gate = sampleV3()
    expect(parseGateMetadataV3(gate)).toEqual(gate)
  })

  it('parses v3 JSON strings', () => {
    const gate = sampleV3()
    expect(parseGateMetadataV3(JSON.stringify(gate))).toEqual(gate)
  })

  it('returns null on threshold-zero / nonzero-epoch (SDK rule)', () => {
    expect(parseGateMetadataV3(sampleV3({ threshold: '0', epoch: 5 }))).toBeNull()
  })

  it('accepts threshold-zero / epoch-zero collapse', () => {
    const collapsed = sampleV3({ threshold: '0', epoch: 0 })
    expect(parseGateMetadataV3(collapsed)).toEqual(collapsed)
  })

  it('returns null for v1 records', () => {
    expect(parseGateMetadataV3(sampleV1())).toBeNull()
  })
})

describe('isGateMetadataV3 type guard', () => {
  it('returns true for valid v3', () => {
    expect(isGateMetadataV3(sampleV3())).toBe(true)
  })
  it('returns false for v1', () => {
    expect(isGateMetadataV3(sampleV1())).toBe(false)
  })
})

describe('parseAnyGateMetadata dispatcher', () => {
  it('routes v1 records to v1 shape', () => {
    const gate = sampleV1()
    const parsed = parseAnyGateMetadata(gate)
    expect(parsed).toEqual(gate)
    expect((parsed as GateMetadataJson).version).toBe(1)
    expect(isGateMetadata(parsed)).toBe(true)
  })

  it('routes v3 records to v3 shape', () => {
    const gate = sampleV3()
    const parsed = parseAnyGateMetadata(gate)
    expect(parsed).toEqual(gate)
    expect((parsed as GateMetadataV3Json).version).toBe(3)
    expect(isGateMetadataV3(parsed)).toBe(true)
  })

  it('parses JSON-string input for both versions', () => {
    expect(parseAnyGateMetadata(JSON.stringify(sampleV1()))).toEqual(sampleV1())
    expect(parseAnyGateMetadata(JSON.stringify(sampleV3()))).toEqual(sampleV3())
  })

  it('returns null on unknown version', () => {
    expect(parseAnyGateMetadata({ ...sampleV1(), version: 2 as unknown as 1 })).toBeNull()
  })

  it('returns null when version is a boolean (true === 1 trap)', () => {
    expect(
      parseAnyGateMetadata({ ...sampleV1(), version: true as unknown as 1 }),
    ).toBeNull()
  })

  it('returns null on invalid JSON', () => {
    expect(parseAnyGateMetadata('not-json')).toBeNull()
  })

  it('returns null on null/undefined input', () => {
    expect(parseAnyGateMetadata(null)).toBeNull()
    expect(parseAnyGateMetadata(undefined)).toBeNull()
  })

  it('parses Uint8Array input for both versions', () => {
    const enc = new TextEncoder()
    expect(parseAnyGateMetadata(enc.encode(JSON.stringify(sampleV1())))).toEqual(sampleV1())
    expect(parseAnyGateMetadata(enc.encode(JSON.stringify(sampleV3())))).toEqual(sampleV3())
  })

  it('rejects v3 records that violate threshold-zero / epoch-zero invariant', () => {
    expect(
      parseAnyGateMetadata(sampleV3({ threshold: '0', epoch: 7 })),
    ).toBeNull()
  })
})
