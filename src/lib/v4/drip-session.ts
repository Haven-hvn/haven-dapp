/**
 * V4 drip sessions — staged, resumable, handoff-able publish plans.
 *
 * A drip release no longer has to be uploaded in one sitting. A
 * `DripSession` is created ONCE from (source file + target ladder + gate)
 * and freezes everything that must stay consistent across uploads:
 *
 *   - `dripId`        the on-chain grouping key every stage entity shares
 *   - byte ranges     contiguous slices of ONE committed source (a single
 *                     film, or the virtual concatenation of per-stage files)
 *   - `sourceSha256`  a commitment to those exact bytes
 *   - gate config     chain / token / threshold / oracle
 *   - per-stage state planned targets + (once published) on-chain results
 *
 * Slate mode (`createDripSessionFromSlates`) gives every stage its own file
 * with its own commitment — uploaders resume a stage by attaching just that
 * stage's file; no merged master is ever needed.
 *
 * Stages are then published ONE AT A TIME ("first market cap unlock, then
 * the second, …"), possibly by DIFFERENT wallets or even different people:
 * IBE wrapping needs only public inputs (the canister's derived public key
 * plus the v4 identity), so no secret material is ever shared between
 * uploaders. Each stage generates its own fresh AES key, wraps it to its
 * own v4 identity, and zeroes the key afterwards.
 *
 * The manifest export/import round-trip lets a teammate continue the same
 * drip elsewhere: they import the JSON manifest AND re-select the source
 * file, which is hash-verified against the commitment before any upload —
 * mismatched bytes can never be published into a drip slot.
 *
 * Security properties:
 *   - manifests carry NO secrets (keys exist only transiently at wrap time)
 *   - results must form a contiguous prefix (no gaps → no stranded chunks)
 *   - targets must stay strictly ascending across ALL stages
 *   - every load path re-validates; anything malformed fails closed to null
 *
 * @module lib/v4/drip-session
 */

import { VALID_CHAINS, type Chain as HavenChain } from 'haven-aol'
import { sha256Hex } from '../crypto'
import {
  MAX_DRIP_CHUNKS,
  planDripChunks,
  validateDripConfig,
  type DripChunkPlan,
} from './drip-plan'

// ============================================================================
// Types
// ============================================================================

/** On-chain outcome of publishing one stage. No secrets — safe to share. */
export interface DripStageResult {
  /** Filecoin piece CID of the encrypted chunk. */
  pieceCid: string
  /** Arkiv entity key of the indexed chunk. */
  entityKey: string
  /** SHA-256 (hex) of the encrypted chunk bytes. */
  encryptedHash: string
  /** SHA-256 (hex) of the plaintext slice. */
  originalHash: string
  /** Lowercase address of the wallet that published this stage. */
  publishedBy: string
  /** Wall-clock publish time (ms). */
  publishedAtMs: number
  /** 30-day epoch frozen into this stage's metadata + IBE identity. */
  epoch: number
}

/**
 * Per-stage source commitment. With slate-style publishing each stage is
 * its OWN file: this pins the exact bytes (name, size, SHA-256) that belong
 * in the slot, so any wallet can resume a stage by attaching just that
 * stage's file — the full concatenation is never needed again.
 */
export interface DripStageSourceMeta {
  fileName: string
  fileSize: number
  /** SHA-256 (hex) of this stage's plaintext file (= its slice hash). */
  sha256: string
}

export interface DripStageState {
  plan: DripChunkPlan
  result?: DripStageResult
  /** Present on sessions created from per-stage slates. */
  source?: DripStageSourceMeta
}

export interface DripGateConfigSnapshot {
  chain: HavenChain
  gateToken: string
  gateThreshold: number
  oracleAddress: string
}

export interface DripSession {
  /** Bump when the serialization shape changes. */
  version: typeof DRIP_SESSION_VERSION
  /** Stable uuid grouping all stage entities on-chain. */
  dripId: string
  title: string
  mimeType: string
  fileName: string
  fileSize: number
  /** SHA-256 hex commitment to the FULL source file bytes. */
  sourceSha256: string
  createdAtMs: number
  updatedAtMs: number
  gate: DripGateConfigSnapshot
  stages: DripStageState[]
}

export type SourceVerification =
  | { ok: true }
  | { ok: false; reason: 'SIZE_MISMATCH' | 'HASH_MISMATCH' }

// ============================================================================
// Constants
// ============================================================================

export const DRIP_SESSION_VERSION = 1

const STORAGE_PREFIX = 'haven.drip.session.'
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/
const SHA256_HEX_RE = /^[0-9a-f]{64}$/
/** Domain tag binding the slate commitment to this format. */
const SLATE_COMMITMENT_PREFIX = 'haven.drip.slates.v1:'

// ============================================================================
// Creation + verification
// ============================================================================

/**
 * Create a session from raw source bytes. Hashes the file (commitment),
 * plans contiguous ranges, and validates the ladder up front so an invalid
 * configuration can never become a half-published drip.
 */
export async function createDripSession(args: {
  fileName: string
  mimeType: string
  source: Uint8Array
  config: { chunkCount: number; targetsUsd: number[] }
  gate: DripGateConfigSnapshot
  title: string
}): Promise<DripSession | null> {
  if (validateDripConfig(args.config).length > 0) return null
  const planned = planDripChunks(args.source.byteLength, args.config)
  if (!planned.ok) return null
  if (!isGateShapeValid(args.gate)) return null

  const now = Date.now()
  return {
    version: DRIP_SESSION_VERSION,
    dripId: crypto.randomUUID(),
    title: args.title,
    mimeType: args.mimeType,
    fileName: args.fileName,
    fileSize: args.source.byteLength,
    sourceSha256: await sha256Hex(args.source),
    createdAtMs: now,
    updatedAtMs: now,
    gate: normalizeGate(args.gate),
    stages: planned.chunks.map((plan) => ({ plan })),
  }
}

/**
 * Slate-style creation: ONE FILE PER STAGE.
 *
 * Each stage carries its own `DripStageSourceMeta`, and plans tile the
 * virtual concatenation (stage i occupies exactly its file's bytes), so
 * every downstream invariant — contiguous ranges, ascending targets,
 * slice-hash equality — is preserved without ever materializing a merged
 * source. The whole-source commitment becomes a commitment over the ORDERED
 * per-stage digests.
 */
export async function createDripSessionFromSlates(args: {
  title: string
  mimeType: string
  config: { chunkCount: number; targetsUsd: number[] }
  gate: DripGateConfigSnapshot
  slates: Array<{ fileName: string; fileSize: number; sha256: string }>
}): Promise<DripSession | null> {
  const { config, slates } = args
  if (validateDripConfig(config).length > 0) return null
  if (slates.length !== config.chunkCount) return null
  if (!slates.every((s) => Number.isSafeInteger(s.fileSize) && s.fileSize >= 0)) return null
  if (!slates.every((s) => SHA256_HEX_RE.test(s.sha256))) return null
  if (!slates.some((s) => s.fileSize > 0)) return null
  if (!isGateShapeValid(args.gate)) return null

  const fileSize = slates.reduce((total, s) => total + s.fileSize, 0)

  // Ranges follow the ACTUAL slate boundaries exactly — stage i occupies
  // precisely its own file's bytes in the virtual concatenation.
  const now = Date.now()
  const stages: DripStageState[] = []
  let cursor = 0
  slates.forEach((s, i) => {
    const endByte = cursor + s.fileSize
    stages.push({
      plan: {
        dripIndex: i,
        dripTotal: slates.length,
        startByte: cursor,
        endByte,
        marketCapTargetUsd: config.targetsUsd[i],
      },
      source: {
        fileName: s.fileName,
        fileSize: s.fileSize,
        sha256: s.sha256.toLowerCase(),
      },
    })
    cursor = endByte
  })

  const commitmentInput =
    SLATE_COMMITMENT_PREFIX + slates.map((s) => s.sha256.toLowerCase()).join(':')
  const sourceSha256 = await sha256Hex(commitmentInput)

  return {
    version: DRIP_SESSION_VERSION,
    dripId: crypto.randomUUID(),
    title: args.title,
    mimeType: args.mimeType,
    fileName:
      slates.length > 1 ? `${slates[0].fileName} +${slates.length - 1} more` : slates[0].fileName,
    fileSize,
    sourceSha256,
    createdAtMs: now,
    updatedAtMs: now,
    gate: normalizeGate(args.gate),
    stages,
  }
}

/**
 * Verify candidate bytes for ONE stage slot against its own commitment.
 * Size first (cheap), then SHA-256 — a stage publish must never encrypt
 * bytes that do not belong in this exact slot.
 */
export async function verifyStageSource(
  source: Uint8Array,
  expected: DripStageSourceMeta
): Promise<SourceVerification> {
  if (source.byteLength !== expected.fileSize) {
    return { ok: false, reason: 'SIZE_MISMATCH' }
  }
  const hash = await sha256Hex(source)
  if (hash !== expected.sha256) {
    return { ok: false, reason: 'HASH_MISMATCH' }
  }
  return { ok: true }
}

/**
 * Verify candidate source bytes against a bare commitment (sha + size)
 * without needing a full session object — used by the per-stage upload UI.
 */
export async function verifySourceAgainstCommitment(
  source: Uint8Array,
  expectedSha256: string,
  expectedSize: number
): Promise<SourceVerification> {
  if (source.byteLength !== expectedSize) {
    return { ok: false, reason: 'SIZE_MISMATCH' }
  }
  const hash = await sha256Hex(source)
  if (hash !== expectedSha256) {
    return { ok: false, reason: 'HASH_MISMATCH' }
  }
  return { ok: true }
}

/**
 * Verify candidate source bytes against the session's commitment.
 * Size first (cheap), then SHA-256 — a stage upload must never encrypt
 * bytes that do not belong to this drip.
 */
export async function verifySourceForSession(
  session: DripSession,
  source: Uint8Array
): Promise<SourceVerification> {
  if (source.byteLength !== session.fileSize) {
    return { ok: false, reason: 'SIZE_MISMATCH' }
  }
  const hash = await sha256Hex(source)
  if (hash !== session.sourceSha256) {
    return { ok: false, reason: 'HASH_MISMATCH' }
  }
  return { ok: true }
}

/**
 * The one stage that may be uploaded next: the first unpublished stage.
 * Sequential by design — publishing stage k+1 before stage k would strand
 * locked content behind a missing middle chunk. Returns null when the
 * drip is fully published.
 */
export function nextPublishableIndex(session: DripSession): number | null {
  for (let i = 0; i < session.stages.length; i++) {
    if (!session.stages[i].result) return i
  }
  return null
}

export function completedStageCount(session: DripSession): number {
  let done = 0
  for (const stage of session.stages) if (stage.result) done++
  return done
}

export function isDripComplete(session: DripSession): boolean {
  return nextPublishableIndex(session) === null
}

/**
 * Immutably record a stage result. Enforces sequencing: only the next
 * unpublished stage may be committed (fail-closed against UI races).
 */
export function commitStageResult(
  session: DripSession,
  dripIndex: number,
  result: DripStageResult
): DripSession | null {
  const nextIdx = nextPublishableIndex(session)
  if (nextIdx !== dripIndex) return null
  const normalized: DripStageResult = {
    ...result,
    pieceCid: String(result.pieceCid),
    entityKey: String(result.entityKey),
    publishedBy: String(result.publishedBy).toLowerCase(),
  }
  const stages = session.stages.map((s, i) =>
    i === dripIndex ? { ...s, result: normalized } : s
  )
  return { ...session, stages, updatedAtMs: Date.now() }
}

// ============================================================================
// Persistence (localStorage — resume in this browser)
// ============================================================================

export function listDripSessions(): DripSession[] {
  const storage = getStorage()
  if (!storage) return []
  const sessions: DripSession[] = []
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (!key?.startsWith(STORAGE_PREFIX)) continue
      const raw = storage.getItem(key)
      if (!raw) continue
      const parsed = parseDripManifest(JSON.parse(raw))
      if (parsed) sessions.push(parsed)
    }
  } catch {
    // Corrupted entries are skipped, not fatal — listing stays available.
  }
  sessions.sort((a, b) => b.updatedAtMs - a.updatedAtMs)
  return sessions
}

export function saveDripSession(session: DripSession): void {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.setItem(STORAGE_PREFIX + session.dripId, JSON.stringify(toDripManifest(session)))
  } catch {
    // Quota/private-mode failures must never break a publish run.
  }
}

export function deleteDripSession(dripId: string): void {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.removeItem(STORAGE_PREFIX + dripId)
  } catch {
    // ignore
  }
}

function getStorage(): Storage | null {
  try {
    // Browsers expose localStorage on globalThis; tests stub the same slot.
    return (globalThis as { localStorage?: Storage }).localStorage ?? null
  } catch {
    return null
  }
}

// ============================================================================
// Manifest export / import (hand-off between uploaders & machines)
// ============================================================================

/**
 * The shareable hand-off kit. Identical to the persisted shape — it holds
 * the plan, commitments and (partial) results, but NEVER any key material.
 */
export type DripManifest = DripSession

export function toDripManifest(session: DripSession): DripManifest {
  return session
}

/**
 * Strictly parse + validate a manifest from untrusted JSON.
 * Returns null on ANY structural violation (fail closed).
 */
export function parseDripManifest(raw: unknown): DripSession | null {
  if (typeof raw !== 'object' || raw === null) return null
  const m = raw as Record<string, unknown>
  if (m.version !== DRIP_SESSION_VERSION) return null

  const dripId = requireNonEmptyString(m.dripId)
  const title = typeof m.title === 'string' ? m.title : ''
  const mimeType = requireNonEmptyString(m.mimeType)
  const fileName = requireNonEmptyString(m.fileName)
  const fileSize = m.fileSize
  const sourceSha256 = m.sourceSha256
  const createdAtMs = m.createdAtMs
  const updatedAtMs = m.updatedAtMs
  if (
    !dripId ||
    !mimeType ||
    !fileName ||
    typeof fileSize !== 'number' ||
    !Number.isSafeInteger(fileSize) ||
    fileSize < 0 ||
    typeof sourceSha256 !== 'string' ||
    !SHA256_HEX_RE.test(sourceSha256) ||
    typeof createdAtMs !== 'number' ||
    typeof updatedAtMs !== 'number'
  ) {
    return null
  }

  const gateRaw = m.gate
  if (typeof gateRaw !== 'object' || gateRaw === null) return null
  const g = gateRaw as Record<string, unknown>
  if (
    typeof g.chain !== 'string' ||
    !VALID_CHAINS.includes(g.chain as HavenChain) ||
    typeof g.gateToken !== 'string' ||
    !ADDRESS_RE.test(g.gateToken) ||
    typeof g.gateThreshold !== 'number' ||
    !Number.isSafeInteger(g.gateThreshold) ||
    g.gateThreshold < 1 ||
    typeof g.oracleAddress !== 'string' ||
    !ADDRESS_RE.test(g.oracleAddress)
  ) {
    return null
  }
  const gate: DripGateConfigSnapshot = {
    chain: g.chain as HavenChain,
    gateToken: g.gateToken.toLowerCase(),
    gateThreshold: g.gateThreshold,
    oracleAddress: g.oracleAddress.toLowerCase(),
  }

  if (!Array.isArray(m.stages) || m.stages.length === 0 || m.stages.length > MAX_DRIP_CHUNKS) {
    return null
  }

  // Stages: plans must tile the file contiguously with ascending targets;
  // results must form a contiguous prefix (no gaps, nothing after a hole).
  const stages: DripStageState[] = []
  let cursor = 0
  let seenHole = false
  for (let i = 0; i < m.stages.length; i++) {
    const entry = m.stages[i]
    if (typeof entry !== 'object' || entry === null) return null
    const e = entry as Record<string, unknown>

    const planRaw = e.plan
    if (typeof planRaw !== 'object' || planRaw === null) return null
    const p = planRaw as Record<string, unknown>
    const isEmptyRange = p.endByte === p.startByte
    const degenerateEmpty =
      isEmptyRange && fileSize === 0 && m.stages.length === 1
    if (
      p.dripIndex !== i ||
      p.dripTotal !== m.stages.length ||
      p.startByte !== cursor ||
      typeof p.endByte !== 'number' ||
      !Number.isSafeInteger(p.endByte) ||
      (isEmptyRange && !degenerateEmpty) ||
      p.endByte < p.startByte ||
      p.endByte > fileSize ||
      typeof p.marketCapTargetUsd !== 'number' ||
      !Number.isSafeInteger(p.marketCapTargetUsd) ||
      p.marketCapTargetUsd <= 0 ||
      (i > 0 && p.marketCapTargetUsd <= stages[i - 1].plan.marketCapTargetUsd)
    ) {
      return null
    }
    cursor = p.endByte as number

    let sourceMeta: DripStageSourceMeta | undefined
    if (e.source != null) {
      const sm = e.source as Record<string, unknown>
      if (
        typeof sm.fileName !== 'string' ||
        !sm.fileName ||
        typeof sm.fileSize !== 'number' ||
        !Number.isSafeInteger(sm.fileSize) ||
        sm.fileSize < 0 ||
        typeof sm.sha256 !== 'string' ||
        !SHA256_HEX_RE.test(sm.sha256)
      ) {
        return null
      }
      // A slot's committed size must equal its planned byte range.
      if (sm.fileSize !== (p.endByte as number) - (p.startByte as number)) return null
      sourceMeta = {
        fileName: sm.fileName,
        fileSize: sm.fileSize,
        sha256: sm.sha256.toLowerCase(),
      }
    }

    let result: DripStageResult | undefined
    if (e.result != null) {
      if (seenHole) return null // result after a gap — invalid ordering
      const r = e.result as Record<string, unknown>
      if (
        typeof r.pieceCid !== 'string' ||
        r.pieceCid.length === 0 ||
        typeof r.entityKey !== 'string' ||
        r.entityKey.length === 0 ||
        typeof r.encryptedHash !== 'string' ||
        !SHA256_HEX_RE.test(r.encryptedHash.replace(/^0x/, '')) ||
        typeof r.originalHash !== 'string' ||
        !SHA256_HEX_RE.test(r.originalHash.replace(/^0x/, '')) ||
        typeof r.publishedBy !== 'string' ||
        !ADDRESS_RE.test(r.publishedBy) ||
        typeof r.publishedAtMs !== 'number' ||
        typeof r.epoch !== 'number' ||
        !Number.isSafeInteger(r.epoch) ||
        r.epoch < 0
      ) {
        return null
      }
      result = {
        pieceCid: r.pieceCid,
        entityKey: r.entityKey,
        encryptedHash: r.encryptedHash,
        originalHash: r.originalHash,
        publishedBy: r.publishedBy.toLowerCase(),
        publishedAtMs: r.publishedAtMs,
        epoch: r.epoch,
      }
    } else {
      seenHole = true
    }

    stages.push({
      plan: {
        dripIndex: i,
        dripTotal: m.stages.length,
        startByte: p.startByte as number,
        endByte: p.endByte as number,
        marketCapTargetUsd: p.marketCapTargetUsd as number,
      },
      result,
      ...(sourceMeta ? { source: sourceMeta } : {}),
    })
  }

  if (cursor !== fileSize && fileSize > 0) return null

  return {
    version: DRIP_SESSION_VERSION,
    dripId,
    title,
    mimeType,
    fileName,
    fileSize,
    sourceSha256,
    createdAtMs,
    updatedAtMs,
    gate,
    stages,
  }
}

// ============================================================================
// Shape helpers
// ============================================================================

function isGateShapeValid(gate: DripGateConfigSnapshot): boolean {
  return (
    VALID_CHAINS.includes(gate.chain) &&
    ADDRESS_RE.test(gate.gateToken) &&
    Number.isSafeInteger(gate.gateThreshold) &&
    gate.gateThreshold >= 1 &&
    ADDRESS_RE.test(gate.oracleAddress)
  )
}

function normalizeGate(gate: DripGateConfigSnapshot): DripGateConfigSnapshot {
  return {
    chain: gate.chain,
    gateToken: gate.gateToken.toLowerCase(),
    gateThreshold: Math.max(1, Math.floor(gate.gateThreshold)),
    oracleAddress: gate.oracleAddress.toLowerCase(),
  }
}

function requireNonEmptyString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}
