/**
 * Haven-AOL gate metadata — v1 (canonical Arkiv encryption format) plus the
 * additive v3 dispatcher.
 *
 * v1 behavior is FROZEN. Every symbol declared before the
 * "v3 additive surface" banner below is byte-for-byte unchanged from the
 * pre-v3 module; v1 callers and v1 fixtures must continue to compile and
 * pass without modification.
 *
 * v3 is layered on top:
 *   • `GATE_METADATA_VERSION_V3` literal constant.
 *   • Re-exports of `parseGateMetadataV3` and `GateMetadataV3Json` from the
 *     SDK — the SDK owns the v3 derivation, validation, and serialization
 *     rules; this module does not re-implement them.
 *   • `parseAnyGateMetadata` — a soft-fail discriminated dispatcher that
 *     returns `GateMetadataJson | GateMetadataV3Json | null` keyed on the
 *     `version` field. The existing throwing v1 `parseGateMetadata` is left
 *     alone (callers depend on its v1-only contract).
 *
 * @module lib/haven-aol/haven-aol-metadata
 */

import type { Chain } from 'haven-aol'
import {
  GATE_METADATA_VERSION_V3 as SDK_GATE_METADATA_VERSION_V3,
  isGateMetadataV3 as sdkIsGateMetadataV3,
  parseGateMetadataV3 as sdkParseGateMetadataV3,
  VALID_CHAINS,
  type GateMetadataV3Json,
} from 'haven-aol'

export const GATE_METADATA_VERSION = 1 as const

/**
 * Haven-AOL gate metadata (version 1) stored in Arkiv payload fields.
 */
export interface GateMetadataJson {
  version: typeof GATE_METADATA_VERSION
  cid: string
  chain: Chain
  tokenAddress: string
  threshold: string
  encryptedAesKey: string
}

const CHAIN_ALIASES: Record<string, Chain> = {
  ethereum: 'EthMainnet',
  eth: 'EthMainnet',
  'eth-mainnet': 'EthMainnet',
  ethmainnet: 'EthMainnet',
  EthMainnet: 'EthMainnet',
  mainnet: 'EthMainnet',
  '1': 'EthMainnet',
  sepolia: 'EthSepolia',
  'eth-sepolia': 'EthSepolia',
  ethsepolia: 'EthSepolia',
  EthSepolia: 'EthSepolia',
  '11155111': 'EthSepolia',
  arbitrum: 'ArbitrumOne',
  'arbitrum-one': 'ArbitrumOne',
  arbitrumone: 'ArbitrumOne',
  ArbitrumOne: 'ArbitrumOne',
  '42161': 'ArbitrumOne',
  base: 'BaseMainnet',
  'base-mainnet': 'BaseMainnet',
  basemainnet: 'BaseMainnet',
  BaseMainnet: 'BaseMainnet',
  '8453': 'BaseMainnet',
  optimism: 'OptimismMainnet',
  'optimism-mainnet': 'OptimismMainnet',
  optimismmainnet: 'OptimismMainnet',
  OptimismMainnet: 'OptimismMainnet',
  '10': 'OptimismMainnet',
}

export function normalizeChain(chain: string): Chain {
  const normalized = CHAIN_ALIASES[chain] || CHAIN_ALIASES[chain.toLowerCase()]
  if (!normalized) {
    throw new Error(
      `Cannot normalize chain "${chain}" to Haven-AOL Chain variant. ` +
        `Valid chains: ${VALID_CHAINS.join(', ')}`
    )
  }
  return normalized
}

export function isGateMetadata(meta: unknown): meta is GateMetadataJson {
  if (!meta || typeof meta !== 'object') return false
  const m = meta as Record<string, unknown>
  return (
    m.version === GATE_METADATA_VERSION &&
    typeof m.encryptedAesKey === 'string' &&
    m.encryptedAesKey.length > 0 &&
    typeof m.tokenAddress === 'string' &&
    m.tokenAddress.length > 0 &&
    typeof m.cid === 'string' &&
    m.cid.length > 0 &&
    typeof m.chain === 'string' &&
    m.chain.length > 0 &&
    typeof m.threshold === 'string'
  )
}

export function normalizeDerivationThreshold(threshold: string): string {
  const parsed = Number.parseInt(String(threshold), 10)
  if (Number.isNaN(parsed)) {
    return '1'
  }
  return String(Math.max(1, parsed))
}

export function normalizeGateMetadataForDerivation(
  meta: GateMetadataJson
): GateMetadataJson {
  return {
    ...meta,
    threshold: normalizeDerivationThreshold(meta.threshold),
  }
}

function isIpfsCid(value: string): boolean {
  const cidPrefixes = ['Qm', 'bafy', 'bafk', 'bafz', 'bafyb']
  return cidPrefixes.some((prefix) => value.startsWith(prefix))
}

/**
 * Fallback when gate.cid must be derived from Arkiv side fields.
 */
export function resolveDerivationCid(
  encryptedCid?: string,
  originalHash?: string
): string {
  if (encryptedCid && isIpfsCid(encryptedCid)) {
    return encryptedCid
  }
  if (originalHash) {
    return `sha256:${originalHash}`
  }
  throw new Error(
    'Cannot determine derivation CID: gate.cid is missing and no original_hash is available.'
  )
}

/**
 * Parse Haven-AOL gate v1 metadata from an Arkiv JSON string or object.
 *
 * **v1-only.** Callers that need v1+v3 dispatch should use
 * `parseAnyGateMetadata` below.
 */
export function parseGateMetadata(raw: unknown): GateMetadataJson | null {
  if (!raw) return null

  let parsed: unknown
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw)
    } catch {
      return null
    }
  } else {
    parsed = raw
  }

  if (!isGateMetadata(parsed)) {
    return null
  }

  return parsed
}

/** @alias parseGateMetadata */
export const parseEncryptionMetadata = parseGateMetadata

/** @alias parseGateMetadata */
export const parseCidEncryptionMetadata = parseGateMetadata

// =============================================================================
// v3 additive surface
// =============================================================================
//
// Everything below is new for Sprint 5. The symbols above are byte-frozen.
//
// The dispatcher is intentionally a NEW function (`parseAnyGateMetadata`)
// rather than a behavior change to the existing `parseGateMetadata`:
// existing callers of `parseGateMetadata` rely on its v1-only return type
// (`GateMetadataJson | null`), and silently widening that to a discriminated
// union would force every consumer to add narrowing. v3-aware code sites
// (the decrypt module, the batch-decrypt module) call the dispatcher
// directly.

/**
 * The integer literal `3` that uploaders place in `version` to indicate v3.
 * Re-exported from the SDK so dapp callers don't need a second import.
 */
export const GATE_METADATA_VERSION_V3 = SDK_GATE_METADATA_VERSION_V3

/**
 * v3 gate-metadata JSON shape. Re-exported from the SDK so dapp code can
 * type-narrow on this without taking a separate dependency on `haven-aol`.
 */
export type { GateMetadataV3Json }

/**
 * Strict v3 parser — accepts a JSON string, a `Uint8Array`, or a
 * pre-deserialised object; returns `null` on any shape violation.
 *
 * This is a thin re-export of the SDK's `parseGateMetadataV3`. The dapp must
 * NOT re-implement the parser; the SDK owns the v3 validation rules (field
 * order, threshold-zero / nonzero-epoch invariant, etc.) and Sprint 3's
 * tests pin them.
 */
export const parseGateMetadataV3 = sdkParseGateMetadataV3

/**
 * Type guard for v3 metadata. Mirrors `isGateMetadata` (the v1 guard) so
 * call sites that already have a parsed object can narrow without
 * re-parsing JSON.
 */
export const isGateMetadataV3 = sdkIsGateMetadataV3

/**
 * Discriminated dispatcher. Inspects `raw.version` and routes:
 *   • `version === 1` → strict v1 parser (`parseGateMetadata` semantics).
 *   • `version === 3` → SDK v3 parser.
 *   • anything else (including `version === true`, which `=== 1` would
 *     accept in a naive integer comparison) → `null`.
 *
 * Soft-fail (`null` on any malformed record) is the contract the decrypt
 * module's dispatcher needs — it lets the caller branch on shape without
 * a try/catch. The existing throwing `parseGateMetadata` is preserved for
 * callers that depend on the throw.
 */
export function parseAnyGateMetadata(
  raw: unknown
): GateMetadataJson | GateMetadataV3Json | null {
  if (raw === null || raw === undefined) return null

  let parsed: unknown
  if (raw instanceof Uint8Array) {
    try {
      parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw))
    } catch {
      return null
    }
  } else if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw)
    } catch {
      return null
    }
  } else {
    parsed = raw
  }

  if (typeof parsed !== 'object' || parsed === null) return null
  const rec = parsed as Record<string, unknown>
  const version = rec.version

  // Critical: `true === 1` evaluates to true in loose comparison, and even
  // strict equality (`===`) returns false only because of the type check.
  // We pre-empt any future ambiguity by rejecting booleans outright before
  // dispatching on integer equality.
  if (typeof version === 'boolean') return null

  if (version === GATE_METADATA_VERSION) {
    return isGateMetadata(parsed) ? parsed : null
  }
  if (version === GATE_METADATA_VERSION_V3) {
    return sdkIsGateMetadataV3(parsed) ? (parsed as GateMetadataV3Json) : null
  }
  return null
}
