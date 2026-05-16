/**
 * Legacy Encryption Types for Haven Web DApp
 *
 * These types describe the on-disk format of encryption metadata stored in
 * Arkiv payloads created by haven-cli's Lit-era uploads.  They are needed
 * solely for **parsing** existing entities — all new encryptions use
 * Haven-AOL gate metadata (see src/lib/haven-aol/haven-aol-metadata.ts).
 *
 * @module types/encryption
 */

// ============================================================================
// Legacy Hybrid-V1 Encryption Metadata
// ============================================================================

/**
 * Hybrid-v1 encryption metadata from legacy haven-cli uploads.
 * Uses AES-256-GCM for content, with the AES key wrapped via IBE.
 *
 * This is the same shape as HybridV1EncryptionMetadata in haven-aol-metadata,
 * re-exported here for typing Arkiv payload parsing.
 */
export interface LitEncryptionMetadata {
  /** Encryption scheme version */
  version: 'hybrid-v1'

  /** Base64-encoded ciphertext of the AES key */
  encryptedKey: string

  /** SHA-256 hash of the original AES key */
  keyHash: string

  /** Base64-encoded 12-byte initialization vector */
  iv: string

  /** Encryption algorithm */
  algorithm: 'AES-GCM'

  /** Key length in bits */
  keyLength: 256

  /** Access control conditions */
  accessControlConditions: AccessControlCondition[]

  /** Blockchain chain */
  chain: string

  /** Original MIME type of the encrypted file */
  originalMimeType?: string

  /** Original file size in bytes */
  originalSize?: number

  /** SHA-256 hash of the original file */
  originalHash?: string
}

// ============================================================================
// Access Control Types (legacy format)
// ============================================================================

/**
 * Access control condition (legacy format stored in Arkiv).
 */
export interface AccessControlCondition {
  contractAddress: string
  standardContractType: '' | 'ERC20' | 'ERC721' | 'ERC1155' | 'PKPPermissions'
  chain: string
  method: string
  parameters: string[]
  returnValueTest: {
    comparator: '=' | '>' | '>=' | '<' | '<=' | 'contains'
    value: string
  }
}

/**
 * Boolean operator for combining multiple access control conditions.
 */
export type BooleanOperator = 'and' | 'or'

// ============================================================================
// CID Encryption Types (legacy)
// ============================================================================

/**
 * CID encryption metadata.
 * Used when the Filecoin CID itself is encrypted for privacy.
 */
export interface CidEncryptionMetadata {
  /** Encrypted CID string */
  ciphertext: string

  /** Hash of the data that was encrypted (the original CID) */
  dataToEncryptHash: string

  /** Access control conditions for decrypting the CID */
  accessControlConditions: AccessControlCondition[]

  /** Blockchain chain for access control */
  chain: string
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create owner-only access control conditions.
 *
 * @param walletAddress - The wallet address of the owner
 * @returns Access control conditions array
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
