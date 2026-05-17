/**
 * Haven-AOL gate metadata v1 — canonical Arkiv encryption format.
 *
 * @module lib/haven-aol/haven-aol-metadata
 */

import type { Chain } from 'haven-aol'
import { VALID_CHAINS } from 'haven-aol'

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
