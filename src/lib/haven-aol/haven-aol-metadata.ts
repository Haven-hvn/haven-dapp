/**
 * Haven-AOL Metadata Adapter
 *
 * Bridges Arkiv encryption_metadata (hybrid-v1 format from haven-cli)
 * to Haven-AOL gate metadata JSON format expected by the decrypt SDK.
 *
 * @module lib/haven-aol/haven-aol-metadata
 */

import type { Chain } from 'haven-aol'
import { VALID_CHAINS } from 'haven-aol'

// ============================================================================
// Types
// ============================================================================

/**
 * Arkiv hybrid-v1 encryption metadata shape (from haven-cli uploads).
 */
export interface HybridV1EncryptionMetadata {
  version: 'hybrid-v1'
  encryptedKey: string // base64 IBE-wrapped AES key
  keyHash: string
  iv: string // base64
  algorithm?: 'AES-GCM'
  keyLength?: 256
  accessControlConditions: AccessControlCondition[]
  chain: string
  originalMimeType?: string
  originalSize?: number
  originalHash?: string
}

/**
 * Access control condition from Arkiv/Lit format.
 */
export interface AccessControlCondition {
  contractAddress: string
  standardContractType?: string
  chain: string
  method?: string
  parameters?: string[]
  returnValueTest: {
    comparator: string
    value: string
  }
}

/**
 * Haven-AOL gate metadata (version 1) — the format expected by parseGateMetadata.
 */
export interface GateMetadataJson {
  version: 1
  cid: string
  chain: Chain
  tokenAddress: string
  threshold: string
  encryptedAesKey: string
}

// ============================================================================
// Chain Normalization
// ============================================================================

/**
 * Map various chain name aliases to Haven-AOL Candid Chain variant names.
 *
 * Mirrors haven-cli's `normalize_haven_aol_chain` function.
 */
const CHAIN_ALIASES: Record<string, Chain> = {
  // Mainnet
  ethereum: 'EthMainnet',
  eth: 'EthMainnet',
  'eth-mainnet': 'EthMainnet',
  ethmainnet: 'EthMainnet',
  EthMainnet: 'EthMainnet',
  mainnet: 'EthMainnet',
  '1': 'EthMainnet',

  // Sepolia
  sepolia: 'EthSepolia',
  'eth-sepolia': 'EthSepolia',
  ethsepolia: 'EthSepolia',
  EthSepolia: 'EthSepolia',
  '11155111': 'EthSepolia',

  // Arbitrum
  arbitrum: 'ArbitrumOne',
  'arbitrum-one': 'ArbitrumOne',
  arbitrumone: 'ArbitrumOne',
  ArbitrumOne: 'ArbitrumOne',
  '42161': 'ArbitrumOne',

  // Base
  base: 'BaseMainnet',
  'base-mainnet': 'BaseMainnet',
  basemainnet: 'BaseMainnet',
  BaseMainnet: 'BaseMainnet',
  '8453': 'BaseMainnet',

  // Optimism
  optimism: 'OptimismMainnet',
  'optimism-mainnet': 'OptimismMainnet',
  optimismmainnet: 'OptimismMainnet',
  OptimismMainnet: 'OptimismMainnet',
  '10': 'OptimismMainnet',
}

/**
 * Normalize a chain string to Haven-AOL Candid Chain variant name.
 *
 * @param chain - The chain string from Arkiv metadata
 * @returns Normalized Chain variant name
 * @throws Error if chain cannot be mapped
 */
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

// ============================================================================
// Metadata Detection
// ============================================================================

/**
 * Check if metadata is in the Lit/hybrid-v1 format (from haven-cli uploads).
 */
export function isHybridV1Metadata(meta: unknown): meta is HybridV1EncryptionMetadata {
  if (!meta || typeof meta !== 'object') return false
  const m = meta as Record<string, unknown>
  return (
    m.version === 'hybrid-v1' &&
    typeof m.encryptedKey === 'string' &&
    Array.isArray(m.accessControlConditions)
  )
}

/**
 * Check if metadata is already in Haven-AOL gate format (version 1).
 */
export function isGateMetadata(meta: unknown): meta is GateMetadataJson {
  if (!meta || typeof meta !== 'object') return false
  const m = meta as Record<string, unknown>
  return (
    m.version === 1 &&
    typeof m.encryptedAesKey === 'string' &&
    typeof m.tokenAddress === 'string' &&
    typeof m.cid === 'string'
  )
}

// ============================================================================
// Derivation Threshold
// ============================================================================

/**
 * Clamp a gate metadata threshold string for VetKD derivation (minimum 1).
 *
 * The Haven-AOL canister rejects threshold=0 (#InvalidThreshold). On-chain access
 * conditions may still use returnValueTest.value "0" (e.g. balanceOf > 0).
 */
export function normalizeDerivationThreshold(threshold: string): string {
  const parsed = Number.parseInt(String(threshold), 10)
  if (Number.isNaN(parsed)) {
    return '1'
  }
  return String(Math.max(1, parsed))
}

/**
 * VetKD derivation threshold from an on-chain access condition.
 *
 * Mirrors haven-cli's `derivation_threshold_from_access_condition`.
 */
export function derivationThresholdFromAccessCondition(
  returnValueTest?: { value?: string }
): string {
  return normalizeDerivationThreshold(returnValueTest?.value ?? '1')
}

/**
 * Ensure gate metadata uses a valid VetKD derivation threshold.
 */
export function normalizeGateMetadataForDerivation(
  meta: GateMetadataJson
): GateMetadataJson {
  return {
    ...meta,
    threshold: normalizeDerivationThreshold(meta.threshold),
  }
}

// ============================================================================
// Metadata Conversion
// ============================================================================

/**
 * Convert hybrid-v1 encryption metadata to Haven-AOL gate metadata JSON.
 *
 * @param meta - The hybrid-v1 encryption metadata from Arkiv
 * @param derivationCid - The CID used for derivation (IPFS CID of encrypted blob or sha256:hash)
 * @returns Gate metadata JSON string ready for parseGateMetadata
 * @throws Error if metadata cannot be converted
 */
export function toGateMetadataJson(
  meta: HybridV1EncryptionMetadata,
  derivationCid: string
): string {
  if (!meta.accessControlConditions || meta.accessControlConditions.length === 0) {
    throw new Error('Cannot convert metadata: no accessControlConditions')
  }

  // Use the first access control condition for gate parameters
  const acc = meta.accessControlConditions[0]

  // Determine token address
  const tokenAddress = acc.contractAddress
  if (!tokenAddress) {
    throw new Error('Cannot convert metadata: empty contractAddress in accessControlConditions[0]')
  }

  const threshold = derivationThresholdFromAccessCondition(acc.returnValueTest)

  // Normalize chain
  const chain = normalizeChain(acc.chain || meta.chain)

  const gateMetadata: GateMetadataJson = {
    version: 1,
    cid: derivationCid,
    chain,
    tokenAddress,
    threshold,
    encryptedAesKey: meta.encryptedKey,
  }

  return JSON.stringify(gateMetadata)
}

/**
 * Resolve the derivation CID for a video.
 *
 * Per the migration plan:
 * 1. Prefer `encrypted_cid` attribute if it is the IPFS CID used at encrypt time
 * 2. Else `sha256:<originalHash>` from encryption_metadata.originalHash
 * 3. Log derivation preimage on failure for support
 *
 * @param encryptedCid - The encrypted_cid attribute from Arkiv
 * @param originalHash - The originalHash from encryption_metadata
 * @returns The derivation CID string
 * @throws Error if no derivation CID can be determined
 */
export function resolveDerivationCid(
  encryptedCid?: string,
  originalHash?: string
): string {
  // Prefer encrypted_cid if it looks like an IPFS CID (not Lit ciphertext)
  if (encryptedCid && isIpfsCid(encryptedCid)) {
    return encryptedCid
  }

  // Fallback: use originalHash
  if (originalHash) {
    return `sha256:${originalHash}`
  }

  throw new Error(
    'Cannot determine derivation CID: no valid encrypted_cid or originalHash available. ' +
    'The content may have been encrypted with an older version of haven-cli.'
  )
}

/**
 * Check if a string looks like a valid IPFS CID (not Lit ciphertext).
 */
function isIpfsCid(value: string): boolean {
  // Common CID prefixes
  const cidPrefixes = ['Qm', 'bafy', 'bafk', 'bafz', 'bafyb']
  return cidPrefixes.some(prefix => value.startsWith(prefix))
}

/**
 * Parse raw encryption metadata from Arkiv payload into typed metadata.
 *
 * Handles both string (JSON) and object forms.
 */
export function parseEncryptionMetadata(raw: unknown): HybridV1EncryptionMetadata | GateMetadataJson | null {
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

  if (isGateMetadata(parsed)) return parsed
  if (isHybridV1Metadata(parsed)) return parsed

  return null
}
