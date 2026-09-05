/**
 * V4 drip planning — pure chunk-range math and target validation.
 *
 * A "drip" splits one published file into `n` byte ranges ("chunks"). Each
 * chunk is encrypted with its own AES key, pinned to Filecoin as its own
 * piece, indexed as its own Arkiv entity, and gated behind a market-cap
 * target `T_i` (USD). Targets must be strictly ascending so that unlocks
 * reveal content progressively (T0 teaser → T1 act → T2 finale).
 *
 * Pure module: no network, no wallet, no React. Everything here is
 * unit-testable without mocks.
 *
 * @module lib/v4/drip-plan
 */

// ============================================================================
// Types
// ============================================================================

/** A single chunk's planned byte range within the source file. */
export interface DripChunkPlan {
  /** 0-based position in the drip sequence. */
  dripIndex: number
  /** Total chunks in the drip. */
  dripTotal: number
  /** Inclusive start byte in the source file. */
  startByte: number
  /** Exclusive end byte in the source file. */
  endByte: number
  /** Market-cap unlock target for this chunk, in whole USD (creator intent). */
  marketCapTargetUsd: number
  /**
   * Sealed consensus target (whole units in `targetUnit`), stamped at seal
   * time. The canister enforces THIS number — the Bond curve is the only
   * price source, so for curve gates this is whole ETH converted from the
   * USD intent at the seal-minute rate. Absent on pre-unit sessions, which
   * read as USD intent (and fail closed against the Bond-only canister
   * unless their oracle already names the Bond).
   */
  marketCapTarget?: number
  /** Units of `marketCapTarget`. Defaults to `'usd'` when absent. */
  targetUnit?: TargetUnit
}

/** Units a sealed rung target is expressed in. The canister is Bond-only. */
export type TargetUnit = 'usd' | 'reserve'

/** Publisher-supplied drip configuration (pre-validation). */
export interface DripPlanConfig {
  /** Number of chunks to split the file into (1–MAX_DRIP_CHUNKS). */
  chunkCount: number
  /**
   * Market-cap unlock targets per chunk in whole USD. Must have exactly
   * `chunkCount` entries, strictly ascending.
   */
  targetsUsd: number[]
}

export type DripPlanError =
  | { code: 'CHUNK_COUNT_TOO_SMALL' }
  | { code: 'CHUNK_COUNT_TOO_LARGE'; max: number }
  | { code: 'TARGET_COUNT_MISMATCH'; expected: number; actual: number }
  | { code: 'TARGET_NOT_POSITIVE'; index: number }
  | { code: 'TARGETS_NOT_ASCENDING'; index: number }

export type DripPlanResult =
  | { ok: true; chunks: DripChunkPlan[] }
  | { ok: false; errors: DripPlanError[] }

// ============================================================================
// Constants
// ============================================================================

/** Minimum chunks in a drip. */
export const MIN_DRIP_CHUNKS = 1

/** Maximum chunks in a drip — each chunk costs a Filecoin pin + Arkiv entity. */
export const MAX_DRIP_CHUNKS = 10

/**
 * Suggested target ladders (whole USD). Index 0 is the teaser unlock.
 * Publishers can edit any of these values in the UI.
 */
export const DRIP_TARGET_PRESETS: ReadonlyArray<{
  label: string
  targetsUsd: number[]
}> = [
  { label: 'Teaser · Act · Full', targetsUsd: [1_000_000, 5_000_000, 10_000_000] },
  { label: 'Early · Late', targetsUsd: [2_500_000, 10_000_000] },
  { label: 'Single drop', targetsUsd: [5_000_000] },
]

/**
 * Canonical rung stops (whole USD) for the ladder amount sliders. Targets
 * stay coarse by construction — snap-to-stop makes sub-stop precision
 * unrepresentable, which matches the curve-gaming guidance (thin curves
 * move on single mints; rungs must be wide bars, not fine lines).
 */
export const RUNG_USD_STOPS: ReadonlyArray<number> = [
  1_000_000,
  2_500_000,
  5_000_000,
  10_000_000,
  25_000_000,
  50_000_000,
  100_000_000,
  250_000_000,
  500_000_000,
  1_000_000_000,
]

/** Index of the greatest stop <= value (0 when value is below all stops). */
export function nearestStopIndexBelow(value: number): number {
  let idx = 0
  for (let i = 0; i < RUNG_USD_STOPS.length; i++) {
    if (RUNG_USD_STOPS[i] <= value) idx = i
    else break
  }
  return idx
}

/**
 * Index of the first stop strictly above value (`RUNG_USD_STOPS.length`
 * when none). Slider upper bounds derive from this so rungs stay strictly
 * ascending by construction.
 */
export function firstStopIndexAbove(value: number): number {
  for (let i = 0; i < RUNG_USD_STOPS.length; i++) {
    if (RUNG_USD_STOPS[i] > value) return i
  }
  return RUNG_USD_STOPS.length
}

/** Smallest stop strictly above value, else double (off-stops headroom). */
export function nextStopAbove(value: number): number {
  for (const stop of RUNG_USD_STOPS) {
    if (stop > value) return stop
  }
  return value * 2
}

/**
 * Consensus target for a chunk plan: the sealed value when present, else
 * the USD intent (pre-unit sessions). Publish and derivation MUST use this
 * — never `marketCapTargetUsd` directly — or Bond gates seal USD numbers
 * the canister reads as ETH.
 */
export function sealedTargetOf(plan: Pick<DripChunkPlan, 'marketCapTarget' | 'marketCapTargetUsd' | 'targetUnit'>): {
  target: number
  unit: TargetUnit
} {
  if (
    typeof plan.marketCapTarget === 'number' &&
    Number.isSafeInteger(plan.marketCapTarget) &&
    plan.marketCapTarget > 0
  ) {
    return { target: plan.marketCapTarget, unit: plan.targetUnit ?? 'usd' }
  }
  return { target: Math.round(plan.marketCapTargetUsd), unit: 'usd' }
}

/**
 * Seal USD rung intents into whole reserve units (whole ETH) at the
 * seal-minute rate. Pure — the wizard calls this at seal time and stamps
 * the result into the session, so the sealed number is exactly what the
 * canister enforces.
 *
 * Returns null when sealing is unsafe: missing rate, non-positive/unsafe
 * inputs, or rounded values that are not strictly ascending (whole-ETH
 * rounding can only collide far below realistic rung scales, but the
 * check is load-bearing — equal adjacent targets would share one bar).
 */
export function sealTargetsUsdToReserve(
  targetsUsd: number[],
  ethUsdRate: number | null | undefined
): number[] | null {
  if (ethUsdRate == null || !Number.isFinite(ethUsdRate) || ethUsdRate <= 0) return null
  const sealed: number[] = []
  for (const t of targetsUsd) {
    if (!Number.isFinite(t) || t <= 0) return null
    const whole = Math.max(1, Math.round(t / ethUsdRate))
    if (!Number.isSafeInteger(whole)) return null
    if (sealed.length > 0 && whole <= sealed[sealed.length - 1]) return null
    sealed.push(whole)
  }
  return sealed
}

/**
 * Indexes of sealed (whole-reserve) targets that exceed the token's curve
 * ceiling (`maxSupply × finalPrice`) and can therefore never unlock.
 *
 * Pure — the wizard blocks sealing when this is non-empty. An unknown
 * ceiling (null/undefined/non-positive) yields `[]` (cannot verify, so no
 * block); the seal UI must say so rather than staying silent.
 */
export function sealedTargetsExceedingCeiling(
  sealed: number[] | null | undefined,
  ceilingWhole: number | null | undefined
): number[] {
  if (
    !sealed ||
    ceilingWhole == null ||
    !Number.isSafeInteger(ceilingWhole) ||
    ceilingWhole <= 0
  ) {
    return []
  }
  const out: number[] = []
  sealed.forEach((t, i) => {
    if (Number.isSafeInteger(t) && t > ceilingWhole) out.push(i)
  })
  return out
}

// ============================================================================
// Validation + planning
// ============================================================================

/**
 * Validate a drip configuration without producing ranges.
 * Collects ALL problems (not fail-fast) so the UI can show every error at once.
 */
export function validateDripConfig(config: DripPlanConfig): DripPlanError[] {
  const errors: DripPlanError[] = []

  if (!Number.isInteger(config.chunkCount) || config.chunkCount < MIN_DRIP_CHUNKS) {
    errors.push({ code: 'CHUNK_COUNT_TOO_SMALL' })
  } else if (config.chunkCount > MAX_DRIP_CHUNKS) {
    errors.push({ code: 'CHUNK_COUNT_TOO_LARGE', max: MAX_DRIP_CHUNKS })
  }

  if (config.targetsUsd.length !== config.chunkCount) {
    errors.push({
      code: 'TARGET_COUNT_MISMATCH',
      expected: config.chunkCount,
      actual: config.targetsUsd.length,
    })
    return errors
  }

  for (let i = 0; i < config.targetsUsd.length; i++) {
    const t = config.targetsUsd[i]
    if (!Number.isFinite(t) || t <= 0) {
      errors.push({ code: 'TARGET_NOT_POSITIVE', index: i })
    }
  }
  if (errors.some((e) => e.code === 'TARGET_NOT_POSITIVE')) {
    return errors
  }

  for (let i = 1; i < config.targetsUsd.length; i++) {
    if (config.targetsUsd[i] <= config.targetsUsd[i - 1]) {
      errors.push({ code: 'TARGETS_NOT_ASCENDING', index: i })
      break
    }
  }

  return errors
}

/**
 * Plan the byte ranges for a file of `fileSize` bytes.
 *
 * Ranges are contiguous and near-even; the final range absorbs the remainder
 * so no bytes are dropped or duplicated:
 *   sizes = floor(fileSize/n) each, last gets fileSize - (n-1)*base.
 * Empty ranges are impossible because fileSize >= chunkCount is enforced by
 * clamping (a zero-byte file yields a single empty range when chunkCount=1,
 * which streaming-encrypt handles as one empty GCM record).
 */
export function planDripChunks(fileSize: number, config: DripPlanConfig): DripPlanResult {
  const errors = validateDripConfig(config)
  if (errors.length > 0) {
    return { ok: false, errors }
  }

  const n = config.chunkCount
  const baseSize = Math.floor(fileSize / n)
  const chunks: DripChunkPlan[] = []

  let cursor = 0
  for (let i = 0; i < n; i++) {
    const size = i === n - 1 ? fileSize - cursor : baseSize
    chunks.push({
      dripIndex: i,
      dripTotal: n,
      startByte: cursor,
      endByte: cursor + size,
      marketCapTargetUsd: config.targetsUsd[i],
    })
    cursor += size
  }

  return { ok: true, chunks }
}

/**
 * Slice a chunk's byte range out of the source file data.
 * Returns a copy — callers hand the slice to streaming encryption and should
 * be free to release the original buffer.
 */
export function sliceDripChunk(source: Uint8Array, plan: DripChunkPlan): Uint8Array {
  if (plan.startByte < 0 || plan.endByte > source.length || plan.startByte > plan.endByte) {
    throw new Error(
      `Invalid drip range [${plan.startByte}, ${plan.endByte}) for source of ${source.length} bytes`
    )
  }
  return source.slice(plan.startByte, plan.endByte)
}

/**
 * Human formatting for USD amounts used across publish preview + lock UIs.
 * `$3.1M`, `$450K`, `$950` — one decimal only when it matters.
 */
export function formatUsdCompact(amount: number): string {
  if (!Number.isFinite(amount)) return '$—'
  if (amount >= 1_000_000_000) return `$${trimZeros(amount / 1_000_000_000)}B`
  if (amount >= 1_000_000) return `$${trimZeros(amount / 1_000_000)}M`
  if (amount >= 1_000) return `$${trimZeros(amount / 1_000)}K`
  return `$${Math.round(amount)}`
}

function trimZeros(n: number): string {
  return n.toFixed(1).replace(/\.0$/, '')
}

// ============================================================================
// Stage naming
// ============================================================================

const ROMAN: ReadonlyArray<[number, string]> = [
  [10, 'X'], [9, 'IX'], [8, 'VIII'], [7, 'VII'], [6, 'VI'],
  [5, 'V'], [4, 'IV'], [3, 'III'], [2, 'II'], [1, 'I'],
]

function romanize(n: number): string {
  let rest = n
  let out = ''
  for (const [value, glyph] of ROMAN) {
    while (rest >= value) {
      out += glyph
      rest -= value
    }
  }
  return out
}

/**
 * Creative display name for a stage position — the ladder reads like a
 * film: `Teaser · Act I · Act II · Finale` (single-stage drips are one
 * `Full drop`). Pure formatting; index must be within `[0, total)`.
 */
export function stageLabel(index: number, total: number): string {
  if (!Number.isInteger(index) || !Number.isInteger(total)) return 'Stage'
  if (total <= 1) return 'Full drop'
  if (index === 0) return 'Teaser'
  if (index === total - 1) return 'Finale'
  return `Act ${romanize(index)}`
}
