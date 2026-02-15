/**
 * Lit Protocol Decryption Utilities
 * 
 * Provides functions for decrypting AES keys using Lit Protocol's
 * BLS-IBE (Identity-Based Encryption) scheme. These keys are then
 * used for AES-256-GCM decryption of video content.
 * 
 * This module uses the connected wallet for authentication instead of
 * direct private key management.
 * 
 * @module lib/lit-decrypt
 */

import { getLitClient } from './lit'
import { createLitAuthContext, type LitAuthContextOptions } from './lit-auth'
import type { LitEncryptionMetadata, CidEncryptionMetadata } from '@/types'
import type { Account, Transport, Chain } from 'viem'

// ============================================================================
// Types
// ============================================================================

/**
 * Result of decrypting an AES key via Lit Protocol.
 */
export interface DecryptKeyResult {
  /** The decrypted 256-bit AES key */
  aesKey: Uint8Array
  
  /** Authentication context used for decryption (for caching) */
  authContext?: unknown
}

/**
 * Progress callback for decryption operations.
 */
export type DecryptProgressCallback = (message: string) => void

/**
 * Options for AES key decryption using wallet-based authentication.
 */
export interface DecryptAesKeyOptions {
  /** The encryption metadata containing the encrypted key */
  metadata: LitEncryptionMetadata
  
  /** The viem account from the connected wallet */
  account?: Account
  
  /** The wallet client transport for signing */
  transport?: Transport
  
  /** The blockchain chain to use for authentication */
  chain: Chain
  
  /** EIP-1193 wallet provider (alternative to account/transport) */
  walletProvider?: any
  
  /** Optional progress callback */
  onProgress?: DecryptProgressCallback
  
  /** Abort signal for cancellation */
  signal?: AbortSignal
}

/**
 * Options for CID decryption using wallet-based authentication.
 */
export interface DecryptCidOptions {
  /** The CID encryption metadata */
  metadata: CidEncryptionMetadata
  
  /** The viem account from the connected wallet */
  account?: Account
  
  /** The wallet client transport for signing */
  transport?: Transport
  
  /** The blockchain chain to use for authentication */
  chain: Chain
  
  /** EIP-1193 wallet provider (alternative to account/transport) */
  walletProvider?: any
  
  /** Optional progress callback */
  onProgress?: DecryptProgressCallback
  
  /** Abort signal for cancellation */
  signal?: AbortSignal
}

// ============================================================================
// Errors
// ============================================================================

/**
 * Error thrown when Lit decryption operations fail.
 */
export class LitDecryptError extends Error {
  constructor(
    message: string,
    public code: 
      | 'CLIENT_NOT_INITIALIZED'
      | 'AUTH_FAILED'
      | 'DECRYPTION_FAILED'
      | 'NOT_AUTHORIZED'
      | 'SESSION_EXPIRED'
      | 'CANCELLED'
      | 'NETWORK_ERROR'
      | 'INVALID_METADATA'
      | 'WALLET_NOT_CONNECTED'
  ) {
    super(message)
    this.name = 'LitDecryptError'
  }
}

// ============================================================================
// AES Key Decryption
// ============================================================================

/**
 * Decrypt an AES key using Lit Protocol with wallet-based authentication.
 * 
 * This function uses Lit's BLS-IBE to decrypt the AES key that was
 * used to encrypt the video content. The decrypted key can then be
 * used with aesDecrypt() to decrypt the actual video data.
 * 
 * The user's connected wallet will be prompted to sign a SIWE message
 * to authenticate with Lit Protocol nodes.
 * 
 * @param options - Decryption options including wallet account/transport
 * @returns Promise resolving to the decrypted AES key
 * @throws LitDecryptError if decryption fails
 * 
 * @example
 * ```typescript
 * const { data: walletClient } = useWalletClient()
 * 
 * if (walletClient) {
 *   const { aesKey } = await decryptAesKey({
 *     metadata: video.litEncryptionMetadata!,
 *     account: walletClient.account,
 *     transport: walletClient.transport,
 *     chain: walletClient.chain,
 *     onProgress: (msg) => console.log(msg)
 *   })
 *   
 *   // Use the key to decrypt video content
 *   const decrypted = await aesDecrypt(encryptedData, aesKey, iv)
 *   
 *   // Clear the key from memory when done
 *   aesKey.fill(0)
 * }
 * ```
 */
export async function decryptAesKey(
  options: DecryptAesKeyOptions
): Promise<DecryptKeyResult> {
  const { metadata, account, transport, chain, walletProvider, onProgress, signal } = options

  // Check for cancellation
  if (signal?.aborted) {
    throw new LitDecryptError('Decryption cancelled', 'CANCELLED')
  }

  // Validate metadata
  if (!metadata.encryptedKey || !metadata.keyHash) {
    throw new LitDecryptError(
      'Invalid encryption metadata: missing encryptedKey or keyHash',
      'INVALID_METADATA'
    )
  }

  // Validate we have either walletProvider or (account and transport)
  if (!walletProvider && !account) {
    throw new LitDecryptError(
      'No wallet account or provider provided. Make sure wallet is connected.',
      'WALLET_NOT_CONNECTED'
    )
  }

  onProgress?.('Initializing Lit Protocol...')

  let client: ReturnType<typeof getLitClient>
  try {
    client = getLitClient()
  } catch {
    throw new LitDecryptError(
      'Lit client not initialized. Call initLitClient() first.',
      'CLIENT_NOT_INITIALIZED'
    )
  }

  // Check for cancellation again
  if (signal?.aborted) {
    throw new LitDecryptError('Decryption cancelled', 'CANCELLED')
  }

  onProgress?.('Authenticating with your wallet...')

  // Create auth context using wallet-based signing
  let authContext: Awaited<ReturnType<typeof createLitAuthContext>>
  try {
    let authOptions: LitAuthContextOptions

    if (walletProvider) {
      // Use walletProvider directly
      authOptions = {
        walletProvider,
        chain,
      }
    } else {
      // Use explicit account, transport, and chain
      authOptions = {
        account: account!,
        transport: transport!,
        chain,
      }
    }

    authContext = await createLitAuthContext(authOptions)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Authentication failed'
    
    if (message.includes('rejected') || message.includes('denied')) {
      throw new LitDecryptError(
        'Authentication signature was rejected. Please approve the signature request in your wallet.',
        'AUTH_FAILED'
      )
    }
    
    if (message.includes('session') || message.includes('expired')) {
      throw new LitDecryptError(
        'Session expired. Please authenticate again.',
        'SESSION_EXPIRED'
      )
    }
    
    throw new LitDecryptError(
      `Authentication failed: ${message}`,
      'AUTH_FAILED'
    )
  }

  if (signal?.aborted) {
    throw new LitDecryptError('Decryption cancelled', 'CANCELLED')
  }

  onProgress?.('Requesting decryption key from Lit nodes...')

  try {
    // Convert access control conditions to unified format for Lit v8
    const unifiedAccessControlConditions = metadata.accessControlConditions.map(c => ({
      conditionType: 'evmBasic' as const,
      ...c,
    }))

    // Decrypt the AES key using Lit Protocol
    const decryptResult = await client.decrypt({
      data: {
        ciphertext: metadata.encryptedKey,
        dataToEncryptHash: metadata.keyHash,
      },
      unifiedAccessControlConditions,
      authContext,
      chain: metadata.chain,
    } as Parameters<typeof client.decrypt>[0])

    if (signal?.aborted) {
      throw new LitDecryptError('Decryption cancelled', 'CANCELLED')
    }

    onProgress?.('Key decrypted successfully')

    // Ensure the decrypted data is a Uint8Array
    const aesKey = decryptResult.decryptedData instanceof Uint8Array
      ? decryptResult.decryptedData
      : new Uint8Array(decryptResult.decryptedData as ArrayBuffer)

    return {
      aesKey,
      authContext,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'

    // Check for specific error types
    if (message.includes('access control') || message.includes('not authorized')) {
      throw new LitDecryptError(
        'You do not have permission to decrypt this content. ' +
        'Make sure you\'re using the correct wallet.',
        'NOT_AUTHORIZED'
      )
    }

    if (message.includes('network') || message.includes('timeout')) {
      throw new LitDecryptError(
        'Network error while contacting Lit nodes. Please try again.',
        'NETWORK_ERROR'
      )
    }

    if (signal?.aborted) {
      throw new LitDecryptError('Decryption cancelled', 'CANCELLED')
    }

    throw new LitDecryptError(
      `Decryption failed: ${message}`,
      'DECRYPTION_FAILED'
    )
  }
}

// ============================================================================
// CID Decryption
// ============================================================================

/**
 * Decrypt an encrypted CID using Lit Protocol with wallet-based authentication.
 * 
 * For encrypted videos, the actual Filecoin CID may be encrypted
 * separately from the content. This function decrypts that CID so
 * the video content can be fetched.
 * 
 * @param options - Decryption options including wallet account/transport
 * @returns Promise resolving to the decrypted CID string
 * @throws LitDecryptError if decryption fails
 * 
 * @example
 * ```typescript
 * const { data: walletClient } = useWalletClient()
 * 
 * if (walletClient) {
 *   const cid = await decryptCid({
 *     metadata: video.cidEncryptionMetadata!,
 *     account: walletClient.account,
 *     transport: walletClient.transport,
 *     chain: walletClient.chain,
 *   })
 *   
 *   // Now fetch the video from Filecoin
 *   const videoUrl = `https://gateway.lighthouse.storage/ipfs/${cid}`
 * }
 * ```
 */
export async function decryptCid(
  options: DecryptCidOptions
): Promise<string> {
  const { metadata, account, transport, chain, walletProvider, onProgress, signal } = options

  if (signal?.aborted) {
    throw new LitDecryptError('Decryption cancelled', 'CANCELLED')
  }

  // Validate metadata
  if (!metadata.ciphertext || !metadata.dataToEncryptHash) {
    throw new LitDecryptError(
      'Invalid CID encryption metadata: missing ciphertext or dataToEncryptHash',
      'INVALID_METADATA'
    )
  }

  // Validate we have either walletProvider or (account and transport)
  if (!walletProvider && !account) {
    throw new LitDecryptError(
      'No wallet account provided. Make sure wallet is connected.',
      'WALLET_NOT_CONNECTED'
    )
  }

  onProgress?.('Initializing Lit Protocol for CID decryption...')

  let client: ReturnType<typeof getLitClient>
  try {
    client = getLitClient()
  } catch {
    throw new LitDecryptError(
      'Lit client not initialized. Call initLitClient() first.',
      'CLIENT_NOT_INITIALIZED'
    )
  }

  if (signal?.aborted) {
    throw new LitDecryptError('Decryption cancelled', 'CANCELLED')
  }

  onProgress?.('Authenticating for CID decryption...')

  // Create auth context using wallet-based signing
  let authContext: Awaited<ReturnType<typeof createLitAuthContext>>
  try {
    let authOptions: LitAuthContextOptions

    if (walletProvider) {
      // Use walletProvider directly - create auth options with provider
      authOptions = {
        walletProvider,
        chain,
      }
    } else {
      // Use explicit account, transport, and chain
      authOptions = {
        account: account!,
        transport: transport!,
        chain,
      }
    }

    authContext = await createLitAuthContext(authOptions)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Authentication failed'
    throw new LitDecryptError(
      `Authentication failed: ${message}`,
      'AUTH_FAILED'
    )
  }

  if (signal?.aborted) {
    throw new LitDecryptError('Decryption cancelled', 'CANCELLED')
  }

  onProgress?.('Requesting CID decryption...')

  try {
    // Convert access control conditions to unified format
    const unifiedAccessControlConditions = metadata.accessControlConditions.map(c => ({
      conditionType: 'evmBasic' as const,
      ...c,
    }))

    // Decrypt the CID
    const decryptResult = await client.decrypt({
      data: {
        ciphertext: metadata.ciphertext,
        dataToEncryptHash: metadata.dataToEncryptHash,
      },
      unifiedAccessControlConditions,
      authContext,
      chain: metadata.chain,
    } as Parameters<typeof client.decrypt>[0])

    if (signal?.aborted) {
      throw new LitDecryptError('Decryption cancelled', 'CANCELLED')
    }

    // Decode the result as a string (CID)
    const decoder = new TextDecoder()
    const cidBytes = decryptResult.decryptedData instanceof Uint8Array
      ? decryptResult.decryptedData
      : new Uint8Array(decryptResult.decryptedData as ArrayBuffer)
    
    const cid = decoder.decode(cidBytes).trim()

    // Basic CID validation (should start with common CID prefixes)
    const validCidPrefixes = ['Qm', 'bafy', 'bafk', 'bafz', 'k', '1', '0']
    const hasValidPrefix = validCidPrefixes.some(prefix => cid.startsWith(prefix))
    
    if (!hasValidPrefix && cid.length < 30) {
      console.warn('[LitDecrypt] Decrypted value may not be a valid CID:', cid)
    }

    onProgress?.('CID decrypted successfully')

    return cid
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'

    if (message.includes('access control') || message.includes('not authorized')) {
      throw new LitDecryptError(
        'You do not have permission to decrypt this CID.',
        'NOT_AUTHORIZED'
      )
    }

    if (signal?.aborted) {
      throw new LitDecryptError('Decryption cancelled', 'CANCELLED')
    }

    throw new LitDecryptError(
      `CID decryption failed: ${message}`,
      'DECRYPTION_FAILED'
    )
  }
}

// ============================================================================
// Batch Decryption
// ============================================================================

/**
 * Decrypt multiple AES keys in batch using wallet-based authentication.
 * 
 * This is useful when you need to decrypt multiple videos
 * and want to reuse the authentication context.
 * 
 * @param items - Array of metadata and ids
 * @param account - The viem account from the connected wallet
 * @param transport - The wallet client transport for signing
 * @param chain - The blockchain chain to use for authentication
 * @param onProgress - Optional progress callback for each item
 * @returns Promise resolving to array of decryption results
 */
export async function batchDecryptAesKeys(
  items: Array<{
    metadata: LitEncryptionMetadata
    id: string
  }>,
  account: Account,
  transport: Transport,
  chain: Chain,
  onProgress?: (id: string, message: string) => void
): Promise<Array<{ id: string; result?: DecryptKeyResult; error?: Error }>> {
  const results: Array<{ id: string; result?: DecryptKeyResult; error?: Error }> = []

  for (const item of items) {
    try {
      onProgress?.(item.id, 'Decrypting...')
      
      const result = await decryptAesKey({
        metadata: item.metadata,
        account,
        transport,
        chain,
        onProgress: (msg) => onProgress?.(item.id, msg),
      })

      results.push({ id: item.id, result })
    } catch (err) {
      results.push({
        id: item.id,
        error: err instanceof Error ? err : new Error('Unknown error'),
      })
    }
  }

  return results
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a video can be decrypted with the given conditions.
 * 
 * This performs a lightweight check without actually attempting
 * decryption, useful for UI state determination.
 * 
 * @param metadata - The encryption metadata
 * @returns Object with canDecrypt status and reason
 */
export function canDecrypt(metadata: LitEncryptionMetadata | undefined): {
  canDecrypt: boolean
  reason?: string
} {
  if (!metadata) {
    return { canDecrypt: false, reason: 'No encryption metadata available' }
  }

  if (!metadata.encryptedKey) {
    return { canDecrypt: false, reason: 'Missing encrypted key' }
  }

  if (!metadata.keyHash) {
    return { canDecrypt: false, reason: 'Missing key hash' }
  }

  if (!metadata.accessControlConditions || metadata.accessControlConditions.length === 0) {
    return { canDecrypt: false, reason: 'No access control conditions defined' }
  }

  return { canDecrypt: true }
}

/**
 * Get a user-friendly error message for decryption errors.
 * 
 * @param error - The error that occurred
 * @returns Human-readable error message
 */
export function getDecryptionErrorMessage(error: unknown): string {
  if (error instanceof LitDecryptError) {
    switch (error.code) {
      case 'NOT_AUTHORIZED':
        return 'You do not have permission to decrypt this video. Make sure you\'re using the correct wallet.'
      case 'SESSION_EXPIRED':
        return 'Your session has expired. Please sign in again.'
      case 'NETWORK_ERROR':
        return 'Network error while contacting Lit nodes. Please check your connection and try again.'
      case 'CLIENT_NOT_INITIALIZED':
        return 'Lit Protocol is not initialized. Please refresh the page.'
      case 'CANCELLED':
        return 'Decryption was cancelled.'
      case 'INVALID_METADATA':
        return 'Invalid encryption metadata. The video may be corrupted.'
      case 'WALLET_NOT_CONNECTED':
        return 'Please connect your wallet to decrypt this video.'
      case 'AUTH_FAILED':
        return 'Authentication failed. Please approve the signature request in your wallet.'
      default:
        return error.message
    }
  }

  if (error instanceof Error) {
    // Handle memory errors
    if (error.message.includes('out of memory') || error.message.includes('allocation failed')) {
      return 'Video is too large to decrypt in the browser. Please try a different device or use the desktop app.'
    }

    // Handle browser crypto errors
    if (error.message.includes('crypto')) {
      return 'Browser security error. Please ensure you\'re using a secure connection (HTTPS).'
    }

    // Handle user rejection
    if (error.message.includes('rejected') || error.message.includes('denied')) {
      return 'Signature request was rejected. Please approve the signature to decrypt the video.'
    }

    return error.message
  }

  return 'An unknown error occurred during decryption.'
}
