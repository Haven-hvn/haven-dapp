/**
 * V4 drip session tests — staged workflow invariants.
 *
 * Covers:
 *   - creation (commitment hash, contiguous ranges, uuid grouping id)
 *   - source verification (size + SHA-256 fail-closed)
 *   - sequential commit (only the next unpublished stage is accepted)
 *   - manifest round-trip + tamper rejection (ranges, ladder, results,
 *     gate shape, hash formats)
 *   - localStorage persistence roundtrip
 *   - stage naming
 *
 * @module lib/v4/__tests__/drip-session
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { sha256Hex } from '../../crypto'
import { stageLabel } from '../drip-plan'
import {
  completedStageCount,
  createDripSession,
  createDripSessionFromSlates,
  commitStageResult,
  deleteDripSession,
  isDripComplete,
  listDripSessions,
  nextPublishableIndex,
  parseDripManifest,
  saveDripSession,
  toDripManifest,
  verifySourceAgainstCommitment,
  verifySourceForSession,
  verifyStageSource,
  type DripSession,
  type DripStageResult,
} from '../drip-session'

// ---------------------------------------------------------------------------
// Minimal localStorage stub (vitest env is `node`)
// ---------------------------------------------------------------------------

class MemoryStorage implements Storage {
  private map = new Map<string, string>()
  get length() {
    return this.map.size
  }
  key(i: number): string | null {
    return [...this.map.keys()][i] ?? null
  }
  getItem(k: string): string | null {
    return this.map.get(k) ?? null
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v)
  }
  removeItem(k: string): void {
    this.map.delete(k)
  }
  clear(): void {
    this.map.clear()
  }
}

const storage = new MemoryStorage()
;(globalThis as { localStorage?: Storage }).localStorage = storage

beforeEach(() => storage.clear())

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const GATE = {
  chain: 'BaseMainnet' as const,
  gateToken: '0xAa70bC79fD1cB4a6FBA717018351F0C3c64B79Df',
  gateThreshold: 5,
  oracleAddress: '0xc5a076cad94176c2996B32d8466Be1cE757FAa27',
}

function makeSource(bytes = 3000): Uint8Array {
  const src = new Uint8Array(bytes)
  for (let i = 0; i < bytes; i++) src[i] = i % 251
  return src
}

async function makeSession(): Promise<{ session: DripSession; source: Uint8Array }> {
  const source = makeSource()
  const session = await createDripSession({
    fileName: 'film.mp4',
    mimeType: 'video/mp4',
    source,
    config: { chunkCount: 3, targetsUsd: [1_000_000, 5_000_000, 10_000_000] },
    gate: GATE,
    title: 'Atlas Skies',
  })
  if (!session) throw new Error('session creation failed')
  return { session, source }
}

function fakeResult(dripIndex: number): DripStageResult {
  return {
    pieceCid: `bafybeichunk${dripIndex}`,
    entityKey: `0xentity${dripIndex}`,
    encryptedHash: 'a'.repeat(64),
    originalHash: 'b'.repeat(64),
    publishedBy: '0xAbCdEf0123456789AbCdEf0123456789AbCdEf01',
    publishedAtMs: Date.now(),
    epoch: 670 + dripIndex,
  }
}

function cloneManifest(session: DripSession): Record<string, unknown> {
  return structuredClone(toDripManifest(session)) as unknown as Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

describe('createDripSession', () => {
  it('commits to the exact source bytes and plans contiguous ranges', async () => {
    const { session, source } = await makeSession()

    expect(session.dripId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    )
    expect(session.fileSize).toBe(source.byteLength)
    // Independent digest check against the known pattern.
    expect(session.sourceSha256).toBe(await sha256Hex(source))

    let cursor = 0
    for (const [i, stage] of session.stages.entries()) {
      expect(stage.plan.dripIndex).toBe(i)
      expect(stage.plan.dripTotal).toBe(3)
      expect(stage.plan.startByte).toBe(cursor)
      cursor = stage.plan.endByte
      expect(stage.result).toBeUndefined()
    }
    expect(cursor).toBe(source.byteLength)
  })

  it('normalizes gate addresses to lowercase', async () => {
    const { session } = await makeSession()
    expect(session.gate.gateToken).toBe(GATE.gateToken.toLowerCase())
    expect(session.gate.oracleAddress).toBe(GATE.oracleAddress.toLowerCase())
  })

  it('rejects invalid ladders up front', async () => {
    const bad = await createDripSession({
      fileName: 'x',
      mimeType: 'video/mp4',
      source: makeSource(100),
      config: { chunkCount: 2, targetsUsd: [5, 1] },
      gate: GATE,
      title: 't',
    })
    expect(bad).toBeNull()
  })

  it('rejects malformed gates', async () => {
    const bad = await createDripSession({
      fileName: 'x',
      mimeType: 'video/mp4',
      source: makeSource(100),
      config: { chunkCount: 1, targetsUsd: [1] },
      gate: { ...GATE, oracleAddress: 'not-an-address' },
      title: 't',
    })
    expect(bad).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

describe('source verification', () => {
  it('accepts matching bytes via both helpers', async () => {
    const { session, source } = await makeSession()
    await expect(verifySourceForSession(session, source)).resolves.toEqual({ ok: true })
    await expect(
      verifySourceAgainstCommitment(source, session.sourceSha256, session.fileSize)
    ).resolves.toEqual({ ok: true })
  })

  it('fails closed on size mismatch before hashing', async () => {
    const { session } = await makeSession()
    const short = makeSource(2999)
    await expect(verifySourceForSession(session, short)).resolves.toEqual({
      ok: false,
      reason: 'SIZE_MISMATCH',
    })
  })

  it('fails closed on content mismatch with identical size', async () => {
    const { session } = await makeSession()
    const other = makeSource()
    other[0] ^= 0xff
    await expect(verifySourceForSession(session, other)).resolves.toEqual({
      ok: false,
      reason: 'HASH_MISMATCH',
    })
  })
})

// ---------------------------------------------------------------------------
// Sequential commits
// ---------------------------------------------------------------------------

describe('stage sequencing', () => {
  it('exposes stages strictly one at a time and completes cleanly', async () => {
    const { session } = await makeSession()

    expect(nextPublishableIndex(session)).toBe(0)
    expect(completedStageCount(session)).toBe(0)

    // Out-of-order commit refused.
    expect(commitStageResult(session, 1, fakeResult(1))).toBeNull()

    const s1 = commitStageResult(session, 0, fakeResult(0))
    expect(s1).not.toBeNull()
    expect(completedStageCount(s1!)).toBe(1)
    expect(nextPublishableIndex(s1!)).toBe(1)
    // Immutability: original untouched.
    expect(completedStageCount(session)).toBe(0)

    const s2 = commitStageResult(s1!, 1, fakeResult(1))!
    const s3 = commitStageResult(s2, 2, fakeResult(2))!
    expect(nextPublishableIndex(s3)).toBeNull()
    expect(isDripComplete(s3)).toBe(true)
    // Double-commit of an already-done stage refused.
    expect(commitStageResult(s3, 2, fakeResult(2))).toBeNull()
  })

  it('lowercases the publishing address on commit', async () => {
    const { session } = await makeSession()
    const s1 = commitStageResult(session, 0, fakeResult(0))!
    expect(s1.stages[0].result?.publishedBy).toBe('0xabcdef0123456789abcdef0123456789abcdef01')
  })
})

// ---------------------------------------------------------------------------
// Manifest round-trip + tamper rejection
// ---------------------------------------------------------------------------

describe('manifests', () => {
  it('round-trips a fully planned, partially published session', async () => {
    const { session } = await makeSession()
    const s1 = commitStageResult(session, 0, fakeResult(0))!
    const json = JSON.parse(JSON.stringify(toDripManifest(s1)))
    expect(parseDripManifest(json)).toEqual(s1)
  })

  it('round-trips through actual JSON text (serialization safety)', async () => {
    const { session } = await makeSession()
    const text = JSON.stringify(toDripManifest(session))
    expect(parseDripManifest(JSON.parse(text))).toEqual(session)
  })

  it('rejects wrong version', async () => {
    const { session } = await makeSession()
    const m = cloneManifest(session)
    m.version = 99
    expect(parseDripManifest(m)).toBeNull()
  })

  it('rejects bad source hash format', async () => {
    const { session } = await makeSession()
    const m = cloneManifest(session)
    m.sourceSha256 = 'zz'
    expect(parseDripManifest(m)).toBeNull()
  })

  it('rejects unknown chain / malformed gate addresses', async () => {
    const { session } = await makeSession()

    const m = cloneManifest(session)
    ;(m.gate as Record<string, unknown>).chain = 'Polygon'
    expect(parseDripManifest(m)).toBeNull()

    const m2 = cloneManifest(session)
    ;(m2.gate as Record<string, unknown>).gateToken = '0x123'
    expect(parseDripManifest(m2)).toBeNull()
  })

  it('rejects descending targets and range gaps', async () => {
    const { session } = await makeSession()

    const desc = cloneManifest(session)
    const stagesDesc = desc.stages as Array<Record<string, unknown>>
    stagesDesc[1].plan = { ...(stagesDesc[1].plan as object), marketCapTargetUsd: 500 }
    expect(parseDripManifest(desc)).toBeNull()

    const gap = cloneManifest(session)
    const stagesGap = gap.stages as Array<Record<string, unknown>>
    ;(stagesGap[1].plan as Record<string, unknown>).startByte =
      (stagesGap[0].plan as Record<string, unknown>).endByte + 1
    expect(parseDripManifest(gap)).toBeNull()
  })

  it('rejects results that skip a stage (non-contiguous prefix)', async () => {
    const { session } = await makeSession()
    const m = cloneManifest(session)
    const stages = m.stages as Array<Record<string, unknown>>
    stages[1].result = fakeResult(1) // stage 0 still empty
    expect(parseDripManifest(m)).toBeNull()
  })

  it('rejects malformed result fields', async () => {
    const { session } = await makeSession()
    const m = cloneManifest(session)
    const stages = m.stages as Array<Record<string, unknown>>
    stages[0].result = { ...fakeResult(0), encryptedHash: 'nope' }
    expect(parseDripManifest(m)).toBeNull()
  })

  it('rejects zero stages and oversized drips', async () => {
    const { session } = await makeSession()

    const empty = cloneManifest(session)
    empty.stages = []
    expect(parseDripManifest(empty)).toBeNull()

    const big = cloneManifest(session)
    big.stages = Array.from({ length: 11 }, (_, i) => ({
      plan: {
        dripIndex: i,
        dripTotal: 11,
        startByte: i,
        endByte: i + 1,
        marketCapTargetUsd: i + 1,
      },
    }))
    big.fileSize = 11
    expect(parseDripManifest(big)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

describe('localStorage persistence', () => {
  it('save → list → delete roundtrip', async () => {
    const a = await makeSession()
    const b = await makeSession()
    saveDripSession(a.session)
    saveDripSession(b.session)

    const listed = listDripSessions()
    expect(listed).toHaveLength(2)
    expect(new Set(listed.map((s) => s.dripId))).toEqual(
      new Set([a.session.dripId, b.session.dripId])
    )
    const found = listed.find((s) => s.dripId === a.session.dripId)
    expect(found).toEqual(a.session)

    deleteDripSession(a.session.dripId)
    expect(listDripSessions()).toHaveLength(1)
  })

  it('skips corrupted entries instead of throwing', async () => {
    const { session } = await makeSession()
    saveDripSession(session)
    storage.setItem('haven.drip.session.corrupt', '{not json')
    expect(() => listDripSessions()).not.toThrow()
    expect(listDripSessions()).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Slate mode — one file per stage
// ---------------------------------------------------------------------------

const SLATE_SIZES = [1000, 1200, 800]

async function makeSlates(): Promise<Array<{ fileName: string; fileSize: number; sha256: string }>> {
  return Promise.all(
    SLATE_SIZES.map(async (size, i) => ({
      fileName: `part-${i}.mp4`,
      fileSize: size,
      sha256: await sha256Hex(makeSource(size)),
    }))
  )
}

describe('createDripSessionFromSlates', () => {
  it('tiles ranges from per-stage sizes and commits each slot', async () => {
    const slates = await makeSlates()
    const session = await createDripSessionFromSlates({
      title: 'Atlas Skies',
      mimeType: 'video/mp4',
      config: { chunkCount: 3, targetsUsd: [1_000_000, 5_000_000, 10_000_000] },
      gate: GATE,
      slates,
    })
    if (!session) throw new Error('slate session creation failed')

    expect(session.fileSize).toBe(SLATE_SIZES.reduce((a, b) => a + b, 0))
    let cursor = 0
    session.stages.forEach((stage, i) => {
      expect(stage.plan.startByte).toBe(cursor)
      expect(stage.plan.endByte).toBe(cursor + SLATE_SIZES[i])
      expect(stage.source?.fileName).toBe(slates[i].fileName)
      expect(stage.source?.fileSize).toBe(slates[i].fileSize)
      expect(stage.source?.sha256).toBe(slates[i].sha256.toLowerCase())
      cursor = stage.plan.endByte
    })
    expect(cursor).toBe(session.fileSize)

    const expectedCommitment = await sha256Hex(
      'haven.drip.slates.v1:' + slates.map((s) => s.sha256.toLowerCase()).join(':')
    )
    expect(session.sourceSha256).toBe(expectedCommitment)
  })

  it('rejects slate count mismatch, all-empty slates, bad hashes', async () => {
    const base = {
      title: 't',
      mimeType: 'video/mp4',
      config: { chunkCount: 2, targetsUsd: [1, 2] },
      gate: GATE,
    }
    const good = await makeSlates()

    await expect(
      createDripSessionFromSlates({ ...base, slates: good.slice(0, 1) })
    ).resolves.toBeNull()
    await expect(
      createDripSessionFromSlates({
        ...base,
        slates: [
          { fileName: 'a', fileSize: 0, sha256: await sha256Hex('x') },
          { fileName: 'b', fileSize: 0, sha256: await sha256Hex('y') },
        ],
      })
    ).resolves.toBeNull()
    await expect(
      createDripSessionFromSlates({
        ...base,
        slates: [
          { fileName: 'a', fileSize: 5, sha256: 'nope' },
          { fileName: 'b', fileSize: 5, sha256: 'a'.repeat(64) },
        ],
      })
    ).resolves.toBeNull()
  })

  it('round-trips through the manifest parser with per-stage sources', async () => {
    const slates = await makeSlates()
    const session = (await createDripSessionFromSlates({
      title: 't',
      mimeType: 'video/mp4',
      config: { chunkCount: 3, targetsUsd: [10, 20, 30] },
      gate: GATE,
      slates,
    }))!
    const text = JSON.stringify(toDripManifest(session))
    expect(parseDripManifest(JSON.parse(text))).toEqual(session)
  })

  it('rejects a tampered per-stage source (size off-range, bad sha)', async () => {
    const slates = await makeSlates()
    const session = (await createDripSessionFromSlates({
      title: 't',
      mimeType: 'video/mp4',
      config: { chunkCount: 3, targetsUsd: [10, 20, 30] },
      gate: GATE,
      slates,
    }))!
    const m = cloneManifest(session)
    const stages = m.stages as Array<Record<string, unknown>>
    ;(stages[1].source as Record<string, unknown>).fileSize += 1
    expect(parseDripManifest(m)).toBeNull()

    const m2 = cloneManifest(session)
    const stages2 = m2.stages as Array<Record<string, unknown>>
    ;(stages2[0].source as Record<string, unknown>).sha256 = 'zz'
    expect(parseDripManifest(m2)).toBeNull()
  })

  it('verifies a stage slot fail-closed via verifyStageSource', async () => {
    const slates = await makeSlates()
    const bytes = makeSource(SLATE_SIZES[1])
    const meta = { fileName: slates[1].fileName, fileSize: SLATE_SIZES[1], sha256: slates[1].sha256 }

    await expect(verifyStageSource(bytes, meta)).resolves.toEqual({ ok: true })
    await expect(verifyStageSource(bytes.slice(0, 9), meta)).resolves.toEqual({
      ok: false,
      reason: 'SIZE_MISMATCH',
    })
    const flipped = bytes
    flipped[0] ^= 0xff
    await expect(verifyStageSource(flipped, meta)).resolves.toEqual({
      ok: false,
      reason: 'HASH_MISMATCH',
    })
  })
})

// ---------------------------------------------------------------------------
// Stage naming
// ---------------------------------------------------------------------------

describe('stageLabel', () => {
  it('names ladders like a film', () => {
    expect(stageLabel(0, 1)).toBe('Full drop')
    expect(stageLabel(0, 4)).toBe('Teaser')
    expect(stageLabel(1, 4)).toBe('Act I')
    expect(stageLabel(2, 4)).toBe('Act II')
    expect(stageLabel(3, 4)).toBe('Finale')
  })
})
