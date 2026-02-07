/**
 * Lit Protocol Encryption Types for Haven Web DApp
 * 
 * Defines TypeScript interfaces for Lit Protocol encryption metadata,
 * including hybrid encryption (AES-256-GCM + BLS-IBE) and access control.
 * 
 * Based on Lit SDK v8 with hybrid encryption support.
 * Reference: https://v8-docs.getlit.dev/
 * 
 * @module types/lit
 */

// ============================================================================
// Lit Encryption Metadata
// ============================================================================

/**
 * Hybrid encryption metadata for Lit Protocol v8.
 * 
 * Uses AES-256-GCM for content encryption, with the AES key encrypted
 * using BLS-IBE (Identity-Based Encryption) through Lit Protocol.
 * 
 * This approach provides:
 * - Fast symmetric encryption for large content (AES-GCM)
 * - Decentralized access control via Lit nodes (BLS-IBE)
 * - No need to manage encryption keys locally
 * 
 * @example
 * ```typescript
 * const metadata: LitEncryptionMetadata = {
 *   version: 'hybrid-v1',
 *   encryptedKey: 'base64_encoded_ciphertext...',
 *   keyHash: 'sha256_hash_of_aes_key',
 *   iv: 'base64_encoded_iv',
 *   algorithm: 'AES-GCM',
 *   keyLength: 256,
 *   accessControlConditions: [...],
 *   chain: 'ethereum',
 * }
 * ```
 */
export interface LitEncryptionMetadata {
  /** Encryption scheme version */
  version: 'hybrid-v1'
  
  // BLS-encrypted AES key
  /** 
   * Base64-encoded ciphertext of the AES key.
   * Encrypted using Lit's BLS-IBE scheme.
   */
  encryptedKey: string
  
  /** 
   * SHA-256 hash of the original AES key.
   * Used for verification without revealing the key.
   */
  keyHash: string
  
  // AES-GCM parameters
  /** 
   * Base64-encoded 12-byte initialization vector (IV).
   * Required for AES-GCM decryption.
   */
  iv: string
  
  /** Encryption algorithm - always AES-GCM for hybrid encryption */
  algorithm: 'AES-GCM'
  
  /** Key length in bits - always 256 for AES-256-GCM */
  keyLength: 256
  
  // Access control
  /** 
   * Conditions that must be met to decrypt the content.
   * Lit nodes evaluate these conditions before providing decryption shares.
   */
  accessControlConditions: AccessControlCondition[]
  
  /** 
   * Blockchain chain for access control evaluation.
   * @example 'ethereum', 'polygon', 'base'
   */
  chain: string
  
  // Original file info (for verification)
  /** Original MIME type of the encrypted file */
  originalMimeType?: string
  
  /** Original file size in bytes */
  originalSize?: number
  
  /** 
   * SHA-256 hash of the original (unencrypted) file.
   * Used to verify integrity after decryption.
   */
  originalHash?: string
}

// ============================================================================
// Access Control Types
// ============================================================================

/**
 * Access control condition for Lit Protocol.
 * Defines who can decrypt the content.
 * 
 * Lit nodes evaluate these conditions against the blockchain
 * to determine if a user is authorized to decrypt.
 * 
 * @example
 * // Owner-only access
 * {
 *   contractAddress: '',
 *   standardContractType: '',
 *   chain: 'ethereum',
 *   method: '',
 *   parameters: [':userAddress'],
 *   returnValueTest: {
 *     comparator: '=',
 *     value: '0x123...'
 *   }
 * }
 * 
 * @example
 * // ERC721 token holder
 * {
 *   contractAddress: '0xcontract...',
 *   standardContractType: 'ERC721',
 *   chain: 'ethereum',
 *   method: 'balanceOf',
 *   parameters: [':userAddress'],
 *   returnValueTest: {
 *     comparator: '>',
 *     value: '0'
 *   }
 * }
 */
export interface AccessControlCondition {
  /** 
   * Contract address for the condition.
   * Empty string for wallet address comparisons.
   */
  contractAddress: string
  
  /** 
   * Type of contract standard.
   * - '' : No contract (wallet address check)
   * - 'ERC20' : ERC-20 token balance
   * - 'ERC721' : ERC-721 NFT ownership
   * - 'ERC1155' : ERC-1155 multi-token balance
   * - 'PKPPermissions' : Programmable Key Pair permissions
   */
  standardContractType: '' | 'ERC20' | 'ERC721' | 'ERC1155' | 'PKPPermissions'
  
  /** Blockchain chain for the contract */
  chain: string
  
  /** 
   * Contract method to call.
   * Empty for wallet address checks.
   * Common methods: 'balanceOf', 'ownerOf', etc.
   */
  method: string
  
  /** 
   * Parameters for the method call.
   * Use ':userAddress' to represent the requesting user's address.
   */
  parameters: string[]
  
  /** Test to apply to the return value */
  returnValueTest: {
    /** Comparison operator */
    comparator: '=' | '>' | '>=' | '<' | '<=' | 'contains'
    /** Value to compare against */
    value: string
  }
}

/**
 * Boolean operator for combining multiple access control conditions.
 */
export type BooleanOperator = 'and' | 'or'

/**
 * Unified access control condition that can be a single condition,
 * a nested boolean condition, or a timestamp condition.
 */
export type UnifiedAccessControlCondition = 
  | AccessControlCondition 
  | { operator: BooleanOperator }
  | { 
      method: 'timestamp'
      params: string[]
      returnValueTest: {
        comparator: '>' | '<' | '>=' | '<=' | '='
        value: string
      }
    }

// ============================================================================
// CID Encryption Types
// ============================================================================

/**
 * CID encryption metadata.
 * Used when the Filecoin CID itself is encrypted for privacy.
 * 
 * This is useful when you want to hide the fact that content exists
 * on Filecoin, not just encrypt the content itself.
 * 
 * @example
 * ```typescript
 * const cidMetadata: CidEncryptionMetadata = {
 *   ciphertext: 'encrypted_cid_string...',
 *   dataToEncryptHash: 'hash_of_original_cid',
 *   accessControlConditions: [...],
 *   chain: 'ethereum',
 * }
 * ```
 */
export interface CidEncryptionMetadata {
  /** 
   * Encrypted CID string.
   * The actual Filecoin CID is encrypted using Lit.
   */
  ciphertext: string
  
  /** 
   * Hash of the data that was encrypted (the original CID).
   * Used for verification.
   */
  dataToEncryptHash: string
  
  /** Access control conditions for decrypting the CID */
  accessControlConditions: AccessControlCondition[]
  
  /** Blockchain chain for access control */
  chain: string
}

// ============================================================================
// Lit Session Types
// ============================================================================

/**
 * Lit Protocol session signature.
 * Used to authenticate with Lit nodes without signing every request.
 */
export interface LitSessionSignature {
  /** Serialized session signature */
  sig: string
  
  /** Derived via address-based key (ED25519) */
  derivedVia: string
  
  /** 
   * Signed message authorizing the session.
   * Contains the session public key and capabilities.
   */
  signedMessage: string
  
  /** Public key of the session key pair */
  pubkey: string
  
  /** 
   * Address of the wallet that authorized the session.
   * Must match the address in access control conditions.
   */
  address?: string
  
  /** Algorithm used for the session key */
  algo?: string
}

/**
 * Lit auth signature for decryption requests.
 */
export interface LitAuthSignature {
  /** Signature bytes (hex string) */
  sig: string
  
  /** Derived via algorithm */
  derivedVia: string
  
  /** Signed message */
  signedMessage: string
  
  /** Address that signed */
  address: string
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create owner-only access control conditions.
 * Used when content should only be decryptable by the encrypting wallet.
 * 
 * @param walletAddress - The wallet address of the owner
 * @returns Access control conditions array
 * 
 * @example
 * ```typescript
 * const conditions = createOwnerOnlyConditions('0x123...')
 * // Only the owner can decrypt
 * ```
 */
export function createOwnerOnlyConditions(walletAddress: string): AccessControlCondition[] {
  return [{
    contractAddress: '',
    standardContractType: '',
    chain: 'ethereum',
    method: '',
    parameters: [':userAddress'],
    returnValueTest: {
      comparator: '=',
      value: walletAddress.toLowerCase(),
    },
  }]
}

/**
 * Create ERC721 holder access control conditions.
 * Content can be decrypted by holders of a specific NFT.
 * 
 * @param contractAddress - The ERC721 contract address
 * @param chain - The blockchain chain
 * @returns Access control conditions array
 */
export function createERC721HolderConditions(
  contractAddress: string, 
  chain: string = 'ethereum'
): AccessControlCondition[] {
  return [{
    contractAddress,
    standardContractType: 'ERC721',
    chain,
    method: 'balanceOf',
    parameters: [':userAddress'],
    returnValueTest: {
      comparator: '>',
      value: '0',
    },
  }]
}

/**
 * Create ERC20 token holder access control conditions.
 * Content can be decrypted by holders of a minimum token balance.
 * 
 * @param contractAddress - The ERC20 contract address
 * @param minBalance - Minimum balance required (in wei/smallest unit)
 * @param chain - The blockchain chain
 * @returns Access control conditions array
 */
export function createERC20HolderConditions(
  contractAddress: string,
  minBalance: string,
  chain: string = 'ethereum'
): AccessControlCondition[] {
  return [{
    contractAddress,
    standardContractType: 'ERC20',
    chain,
    method: 'balanceOf',
    parameters: [':userAddress'],
    returnValueTest: {
      comparator: '>=',
      value: minBalance,
    },
  }]
}

// ============================================================================
// Decryption Result Types
// ============================================================================

/**
 * Result of a Lit decryption operation.
 */
export interface LitDecryptionResult {
  /** Whether decryption was successful */
  success: boolean
  
  /** Decrypted data (if successful) */
  data?: Uint8Array
  
  /** Error message (if failed) */
  error?: string
  
  /** Error code for programmatic handling */
  errorCode?: LitErrorCode
}

/**
 * Lit Protocol error codes.
 */
export type LitErrorCode =
  | 'NOT_AUTHORIZED'
  | 'SESSION_EXPIRED'
  | 'INVALID_SIGNATURE'
  | 'NETWORK_ERROR'
  | 'DECRYPTION_FAILED'
  | 'TIMEOUT'
  | 'UNKNOWN_ERROR'

/**
 * Progress callback for decryption operations.
 */
export interface LitDecryptionProgress {
  /** Current step in the decryption process */
  step: 'requesting_shares' | 'combining_shares' | 'decrypting' | 'complete'
  
  /** Progress percentage (0-100) */
  progress: number
  
  /** Number of shares received (out of threshold) */
  sharesReceived?: number
  
  /** Total shares needed for decryption */
  sharesRequired?: number
}
