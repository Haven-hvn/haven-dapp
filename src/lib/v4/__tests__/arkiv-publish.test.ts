/**
 * V4 Arkiv entity builder tests — pure wire-shape pinning.
 *
 * Guarantees under test:
 *   1. The series header carries shared facts once (`grp`, `title`,
 *      `gate_type=4`, gate corpus, `drip_id`, `drip_total`) with payload
 *      `{ targets, creator?, mime? }`.
 *   2. Each part carries per-stage facts only (`grp`, `gate_type=4`,
 *      `drip_id`, `drip_idx`, `series_ref`, `mcap_usd`, `sha256_ct`) with
 *      payload `{ piece, gate }` — no mirrors, no repeated series facts.
 *   3. Part payload `gate` parses as NATIVE v4 gate metadata via
 *      `parseAnyGateMetadata` (frozen SDK fields intact).
 *
 * @module lib/v4/__tests__/arkiv-publish
 */

import { describe, it, expect } from 'vitest'
import { buildDripSeriesBody, buildDripPartBody, type DripGateConfig } from '../arkiv-publish'
import { parseAnyGateMetadata } from '../../haven-aol/haven-aol-metadata'

const GATE: DripGateConfig = {
  chain: 'BaseMainnet',
  gateToken: '0xAa70bC79fD1cB4a6FBA717018351F0C3c64B79Df',
  gateThreshold: 5,
  oracleAddress: '0xc5a076cad94176c2996B32d8466Be1cE757FAa27',
  title: 'Atlas Skies — Director’s Cut',
}

const DRIP_ID = '11111111-2222-3333-4444-555555555555'
const SERIES_REF = '0x' + 'ab'.repeat(32)

const PART_ARGS = {
  plan: { dripIndex: 1, marketCapTargetUsd: 5_000_000 },
  gate: GATE,
  pieceCid: 'bafybeichunk1cid',
  encryptedHash: 'DEADBEEF',
  encryptedAesKeyB64: 'AAECAwQFBgcICQ==',
  dripId: DRIP_ID,
  seriesRef: SERIES_REF,
}

function findAttr(attrs: Array<{ key: string; value: string | number }>, key: string) {
  return attrs.find((a) => a.key === key)?.value
}

function attrKeys(attrs: Array<{ key: string; value: string | number }>) {
  return attrs.map((a) => a.key).sort()
}

describe('buildDripSeriesBody', () => {
  const body = buildDripSeriesBody({
    gate: GATE,
    dripId: DRIP_ID,
    dripTotal: 3,
    targets: [1_000_000, 5_000_000, 10_000_000],
    creator: 'atlas',
    mimeType: 'video/mp4',
  })

  it('carries shared facts once (8 attrs, no part coordinates)', () => {
    expect(attrKeys(body.attributes)).toEqual([
      'drip_id',
      'drip_total',
      'gate_chain',
      'gate_threshold',
      'gate_token',
      'gate_type',
      'grp',
      'title',
    ])
    expect(findAttr(body.attributes, 'grp')).toBe('haven.video.drip.series')
    expect(findAttr(body.attributes, 'title')).toBe(GATE.title)
    expect(findAttr(body.attributes, 'gate_type')).toBe(4)
    expect(findAttr(body.attributes, 'drip_id')).toBe(DRIP_ID)
    expect(findAttr(body.attributes, 'drip_total')).toBe(3)
  })

  it('stores the gate corpus in compact form (EIP id, lowercase token)', () => {
    expect(findAttr(body.attributes, 'gate_token')).toBe(GATE.gateToken.toLowerCase())
    expect(findAttr(body.attributes, 'gate_chain')).toBe(8453)
    expect(findAttr(body.attributes, 'gate_threshold')).toBe(5)
  })

  it('stores targets + creator + mime enum in payload', () => {
    expect(body.payloadJson.targets).toEqual([1_000_000, 5_000_000, 10_000_000])
    expect(body.payloadJson.creator).toBe('atlas')
    expect(body.payloadJson.mime).toBe(1)
  })

  it('omits optional payload fields when absent', () => {
    const bare = buildDripSeriesBody({ gate: GATE, dripId: DRIP_ID, dripTotal: 1, targets: [1] })
    expect('creator' in bare.payloadJson).toBe(false)
    expect('mime' in bare.payloadJson).toBe(false)
  })

  it('normalizes threshold to >= 1 (canister rejects zero)', () => {
    const body = buildDripSeriesBody({
      gate: { ...GATE, gateThreshold: 0 },
      dripId: DRIP_ID,
      dripTotal: 1,
      targets: [1],
    })
    expect(findAttr(body.attributes, 'gate_threshold')).toBe(1)
  })
})

describe('buildDripPartBody attributes', () => {
  const body = buildDripPartBody(PART_ARGS)

  it('carries per-stage facts only (7 attrs, no series repeats)', () => {
    expect(attrKeys(body.attributes)).toEqual([
      'drip_id',
      'drip_idx',
      'gate_type',
      'grp',
      'mcap_usd',
      'series_ref',
      'sha256_ct',
    ])
    expect(findAttr(body.attributes, 'grp')).toBe('haven.video.drip.part')
    expect(findAttr(body.attributes, 'gate_type')).toBe(4)
    expect(findAttr(body.attributes, 'drip_id')).toBe(DRIP_ID)
    expect(findAttr(body.attributes, 'drip_idx')).toBe(1)
    expect(findAttr(body.attributes, 'series_ref')).toBe(SERIES_REF)
    expect(findAttr(body.attributes, 'mcap_usd')).toBe(5_000_000)
  })

  it('normalizes the ciphertext hash to bare lowercase hex', () => {
    expect(findAttr(body.attributes, 'sha256_ct')).toBe('deadbeef')
  })

  it('carries no legacy mirrors or series facts', () => {
    for (const key of [
      'project', 'type', 'title', 'is_encrypted', 'piece_cid', 'cid_hash',
      'original_hash', 'content_mime_type', 'gate_token', 'gate_chain',
      'gate_threshold', 'market_cap_target_usd', 'drip_index', 'drip_total',
      'oracle_address', 'published_by',
    ]) {
      expect(findAttr(body.attributes, key)).toBeUndefined()
    }
  })

  it('rounds fractional market-cap targets to whole USD in attrs + gate', () => {
    const body = buildDripPartBody({
      ...PART_ARGS,
      plan: { dripIndex: 0, marketCapTargetUsd: 1_500_000.7 },
    })
    expect(findAttr(body.attributes, 'mcap_usd')).toBe(1_500_001)
    const gate = JSON.parse(body.payloadJson.gate as string)
    expect(gate.marketCapTarget).toBe(1_500_001)
  })

  it('seals the consensus target (whole ETH) while mcap_usd stays USD intent', () => {
    const body = buildDripPartBody({
      ...PART_ARGS,
      plan: {
        dripIndex: 1,
        marketCapTargetUsd: 5_000_000,
        marketCapTarget: 1563,
        targetUnit: 'reserve',
      },
    })
    // Discovery/display attr keeps the dollar intent…
    expect(findAttr(body.attributes, 'mcap_usd')).toBe(5_000_000)
    // …but the gate the canister enforces carries sealed ETH.
    const gate = JSON.parse(body.payloadJson.gate as string)
    expect(gate.marketCapTarget).toBe(1563)
  })
})

describe('buildDripPartBody payload', () => {
  it('carries piece + NATIVE v4 gate (SDK-built, frozen fields intact)', () => {
    const body = buildDripPartBody(PART_ARGS)
    expect(body.payloadJson.piece).toBe(PART_ARGS.pieceCid)
    expect(Object.keys(body.payloadJson).sort()).toEqual(['gate', 'piece'])

    const parsed = parseAnyGateMetadata(body.payloadJson.gate as string)
    expect(parsed).not.toBeNull()
    expect(parsed?.version).toBe(4)

    // v4 shape per haven-aol SDK: threshold is a decimal string, epoch and
    // marketCapTarget are JSON integers, oracleAddress is address-shaped.
    const v4 = parsed as Record<string, unknown>
    expect(v4.cid).toBe(PART_ARGS.pieceCid)
    expect(v4.chain).toBe('BaseMainnet')
    expect(String(v4.tokenAddress).toLowerCase()).toBe(GATE.gateToken.toLowerCase())
    expect(v4.threshold).toBe('5')
    expect(typeof v4.epoch).toBe('number')
    expect(Number.isInteger(v4.epoch as number)).toBe(true)
    expect(v4.marketCapTarget).toBe(5_000_000)
    expect(v4.oracleAddress).toBe(GATE.oracleAddress)
    expect(v4.encryptedAesKey).toBe(PART_ARGS.encryptedAesKeyB64)
  })

  it('normalizes threshold to >= 1 (canister rejects zero)', () => {
    const body = buildDripPartBody({
      ...PART_ARGS,
      gate: { ...GATE, gateThreshold: 0 },
    })
    const gate = JSON.parse(body.payloadJson.gate as string)
    expect(gate.threshold).toBe('1')
  })
})
