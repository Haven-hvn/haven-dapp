/**
 * Haven-AOL Client Configuration
 *
 * Provides configuration and agent factory for communicating with the
 * Haven-AOL ICP canister. Uses anonymous identity — authorization proof
 * is always EVM (EIP-712 + on-chain balance checked by canister).
 *
 * @module lib/haven-aol/haven-aol-client
 */

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
