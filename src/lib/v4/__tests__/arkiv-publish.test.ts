/**
 * V4 Arkiv entity builder tests — pure wire-shape pinning.
 *
 * Guarantees under test:
 *   1. Attributes carry the filterable v4 surface (`gate_type`,
 *      `market_cap_target_usd`, `drip_*`, `oracle_address`) alongside the
 *      standard haven video attrs the community feed already queries.
 *   2. Payload parses as v1 gate metadata via `parseAnyGateMetadata` (so
 *      today's reader path works unchanged) while preserving v4 extras.
 *
 * @module lib/v4/__tests__/arkiv-publish
 */

import { describe, it, expect } from 'vitest'
import { buildDripEntityBody, type DripGateConfig } from '../arkiv-publish'
import { parseAnyGateMetadata } from '../../haven-aol/haven-aol-metadata'

const GATE: DripGateConfig = {
  chain: 'BaseMainnet',
  gateToken: '0xAa70bC79fD1cB4a6FBA717018351F0C3c64B79Df',
  gateThreshold: 5,
  oracleAddress: '0xc5a076cad94176c2996B32d8466Be1cE757FAa27',
  title: 'Atlas Skies — Director’s Cut',
}

const BASE_ARGS = {
  plan: { dripIndex: 1, dripTotal: 3, marketCapTargetUsd: 5_000_000 },
  gate: GATE,
  pieceCid: 'bafybeichunk1cid',
  encryptedHash: '0xdeadbeef',
  originalHash: '0xfeedface',
  mimeType: 'video/mp4',
  encryptedAesKeyB64: 'AAECAwQFBgcICQ==',
  dripId: '11111111-2222-3333-4444-555555555555',
}

function findAttr(attrs: Array<{ key: string; value: string | number }>, key: string) {
  return attrs.find((a) => a.key === key)?.value
}

describe('buildDripEntityBody attributes', () => {
  const body = buildDripEntityBody(BASE_ARGS)

  it('carries the standard haven video attributes', () => {
    expect(findAttr(body.attributes, 'project')).toBe('haven')
    expect(findAttr(body.attributes, 'type')).toBe('video')
    expect(findAttr(body.attributes, 'title')).toBe(GATE.title)
    expect(findAttr(body.attributes, 'is_encrypted')).toBe(1)
    expect(findAttr(body.attributes, 'piece_cid')).toBe(BASE_ARGS.pieceCid)
    expect(findAttr(body.attributes, 'content_mime_type')).toBe('video/mp4')
  })

  it('carries the gate triple', () => {
    expect(findAttr(body.attributes, 'gate_token')).toBe(
      GATE.gateToken.toLowerCase()
    )
    expect(findAttr(body.attributes, 'gate_chain')).toBe('BaseMainnet')
    expect(findAttr(body.attributes, 'gate_threshold')).toBe(5)
  })

  it('carries the filterable v4 surface', () => {
    expect(findAttr(body.attributes, 'gate_type')).toBe(4)
    expect(findAttr(body.attributes, 'market_cap_target_usd')).toBe(5_000_000)
    expect(findAttr(body.attributes, 'drip_index')).toBe(1)
    expect(findAttr(body.attributes, 'drip_total')).toBe(3)
    expect(findAttr(body.attributes, 'drip_id')).toBe(BASE_ARGS.dripId)
    expect(findAttr(body.attributes, 'oracle_address')).toBe(
      GATE.oracleAddress.toLowerCase()
    )
  })
})

describe('buildDripEntityBody payload', () => {
  it('parses as NATIVE v4 gate metadata (SDK-built, frozen fields intact)', () => {
    const body = buildDripEntityBody(BASE_ARGS)
    const parsed = parseAnyGateMetadata(JSON.stringify(body.payloadJson))
    expect(parsed).not.toBeNull()
    expect(parsed?.version).toBe(4)

    // v4 shape per haven-aol SDK: threshold is a decimal string, epoch and
    // marketCapTarget are JSON integers, oracleAddress is address-shaped.
    const v4 = parsed as Record<string, unknown>
    expect(v4.cid).toBe(BASE_ARGS.pieceCid)
    expect(v4.chain).toBe('BaseMainnet')
    expect(String(v4.tokenAddress).toLowerCase()).toBe(GATE.gateToken.toLowerCase())
    expect(v4.threshold).toBe('5')
    expect(typeof v4.epoch).toBe('number')
    expect(Number.isInteger(v4.epoch as number)).toBe(true)
    expect(v4.marketCapTarget).toBe(5_000_000)
    expect(v4.oracleAddress).toBe(GATE.oracleAddress)
    expect(v4.encryptedAesKey).toBe(BASE_ARGS.encryptedAesKeyB64)
  })

  it('preserves additive drip-grouping extras', () => {
    const body = buildDripEntityBody(BASE_ARGS)
    expect(body.payloadJson.dripIndex).toBe(1)
    expect(body.payloadJson.dripTotal).toBe(3)
    expect(body.payloadJson.dripId).toBe(BASE_ARGS.dripId)
  })

  it('normalizes threshold to >= 1 (canister rejects zero)', () => {
    const body = buildDripEntityBody({
      ...BASE_ARGS,
      gate: { ...GATE, gateThreshold: 0 },
    })
    expect(findAttr(body.attributes, 'gate_threshold')).toBe(1)
    expect((body.payloadJson as { threshold?: string }).threshold).toBe('1')
  })

  it('rounds fractional market-cap targets to whole USD in attrs + payload', () => {
    const body = buildDripEntityBody({
      ...BASE_ARGS,
      plan: { dripIndex: 0, dripTotal: 1, marketCapTargetUsd: 1_500_000.7 },
    })
    expect(findAttr(body.attributes, 'market_cap_target_usd')).toBe(1_500_001)
    expect((body.payloadJson as { marketCapTarget?: number }).marketCapTarget).toBe(1_500_001)
  })
})

describe('buildDripEntityBody published_by (staged uploads)', () => {
  it('records the publishing wallet lowercased when provided', () => {
    const body = buildDripEntityBody({
      ...BASE_ARGS,
      publisherAddress: '0xAbCdEf0123456789AbCdEf0123456789AbCdEf01',
    })
    expect(findAttr(body.attributes, 'published_by')).toBe(
      '0xabcdef0123456789abcdef0123456789abcdef01'
    )
  })

  it('omits the attribute for one-shot runs without an explicit publisher', () => {
    const body = buildDripEntityBody(BASE_ARGS)
    expect(findAttr(body.attributes, 'published_by')).toBeUndefined()
  })
})
