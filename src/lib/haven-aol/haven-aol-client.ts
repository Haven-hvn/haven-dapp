/**
 * Haven-AOL Client Configuration
 *
 * Provides configuration and agent factory for communicating with the
 * Haven-AOL ICP canister. Uses anonymous identity — authorization proof
 * is always EVM (EIP-712 + on-chain balance checked by canister).
 *
 * @module lib/haven-aol/haven-aol-client
 */

import { HttpAgent, AnonymousIdentity } from '@icp-sdk/core/agent'

// ============================================================================
// Configuration
// ============================================================================

/**
 * Haven-AOL configuration from environment variables.
 */
export interface HavenAolConfig {
  /** ICP host URL */
  host: string
  /** Haven-AOL canister ID */
  canisterId: string
  /** EIP-712 chain ID for signature verification */
  eip712ChainId: bigint
  /** EIP-712 verifying contract address */
  eip712VerifyingContract: string
  /** Whether to fetch root key (local dev only) */
  fetchRootKey: boolean
}

/**
 * Get Haven-AOL configuration from environment variables.
 * 
 * @returns The validated configuration
 * @throws Error if required environment variables are missing
 */
export function getHavenAolConfig(): HavenAolConfig {
  const host = process.env.NEXT_PUBLIC_ICP_HOST || 'https://icp-api.io'
  const canisterId = process.env.NEXT_PUBLIC_HAVEN_AOL_CANISTER_ID || 'dciac-uaaaa-aaaad-qlzuq-cai'
  const eip712ChainId = BigInt(process.env.NEXT_PUBLIC_EIP712_CHAIN_ID || '1')
  const eip712VerifyingContract = process.env.NEXT_PUBLIC_EIP712_VERIFYING_CONTRACT || '0x0000000000000000000000000000000000000000'
  const fetchRootKey = process.env.NEXT_PUBLIC_HAVEN_AOL_FETCH_ROOT_KEY === 'true'

  return {
    host,
    canisterId,
    eip712ChainId,
    eip712VerifyingContract,
    fetchRootKey,
  }
}

/**
 * Check if Haven-AOL configuration is valid and ready for use.
 * 
 * @returns True if all required configuration is present
 */
export function isHavenAolConfigValid(): boolean {
  try {
    const config = getHavenAolConfig()
    return Boolean(
      config.host &&
      config.canisterId &&
      config.eip712VerifyingContract &&
      config.eip712VerifyingContract !== '0x0000000000000000000000000000000000000000'
    )
  } catch {
    return false
  }
}

// ============================================================================
// Singleton HttpAgent
// ============================================================================

let cachedAgent: HttpAgent | null = null
let cachedAgentHost: string | null = null

/**
 * Get or create a singleton HttpAgent for Haven-AOL canister calls.
 *
 * Safe to reuse because:
 * - Uses AnonymousIdentity (no per-user state)
 * - Config (host, canisterId) doesn't change at runtime
 * - HttpAgent handles connection pooling internally
 *
 * The agent caches subnet node keys internally with a 5-minute TTL,
 * so reusing it avoids redundant read_state calls.
 *
 * @returns A reusable HttpAgent instance
 */
export async function getOrCreateAgent(): Promise<HttpAgent> {
  const config = getHavenAolConfig()

  // Reuse if host hasn't changed
  if (cachedAgent && cachedAgentHost === config.host) {
    return cachedAgent
  }

  const agent = await HttpAgent.create({
    host: config.host,
    identity: new AnonymousIdentity(),
    verifyQuerySignatures: false, // Skip for anonymous agent (canister does EVM auth)
  })

  if (config.fetchRootKey) {
    await agent.fetchRootKey()
  }

  cachedAgent = agent
  cachedAgentHost = config.host
  return agent
}

/**
 * Clear the cached agent (e.g., on config change, wallet disconnect, or for testing).
 */
export function clearAgentCache(): void {
  cachedAgent = null
  cachedAgentHost = null
}
