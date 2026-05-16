/**
 * Haven-AOL Decryption
 *
 * Orchestrates the full Haven-AOL decryption flow:
 * EIP-712 sign → ICP canister call → VetKD unwrap → AES key recovery.
 *
 * Provides content key and CID decryption via ICP VetKD canister.
 *
 * @module lib/haven-aol/haven-aol-decrypt
 */

import { HttpAgent, AnonymousIdentity } from '@icp-sdk/core/agent'
import {
  recoverVetKey,
  ibeDecryptAesKey,
  requestDecryptionKey,
  fetchVerificationKey,
  computeDerivationInput,
  parseGateMetadata,
} from 'haven-aol'
import { getHavenAolConfig } from './haven-aol-client'
import { createSignedGateRequest, retryWithBumpedNonce, type WalletClientLike } from './haven-aol-auth'
import {
  toGateMetadataJson,
  resolveDerivationCid,
  isHybridV1Metadata,
  isGateMetadata,
  normalizeGateMetadataForDerivation,
  type HybridV1EncryptionMetadata,
  type GateMetadataJson,
} from './haven-aol-metadata'
import { HavenAolDecryptError, mapGateError } from './haven-aol-errors'
import { getCachedKey, setCachedKey, getVideoIdFromMetadata } from '../aes-key-cache'

// ============================================================================
// Types
// ============================================================================

/**
 * Options for decrypting the AES content key.
 */
export interface DecryptContentKeyOptions {
  /** The encryption metadata (hybrid-v1 or gate format) */
  encryptionMetadata: HybridV1EncryptionMetadata | GateMetadataJson
  /** The encrypted_cid attribute from Arkiv (for derivation) */
  encryptedCid?: string
  /** The wallet client for signing */
  walletClient: WalletClientLike
  /** Progress callback */
  onProgress?: (message: string) => void
  /** Abort signal for cancellation */
  signal?: AbortSignal
}

/**
 * Result of AES key decryption.
 */
export interface DecryptContentKeyResult {
  /** The decrypted 256-bit AES key */
  aesKey: Uint8Array
  /** Whether the key was served from cache */
  fromCache: boolean
}

/**
 * Options for CID decryption via Haven-AOL.
 */
export interface DecryptCidOptions {
  /** The CID encryption metadata */
  cidEncryptionMetadata: HybridV1EncryptionMetadata | GateMetadataJson
  /** The encrypted CID bytes (base64 or raw) */
  encryptedCidData: Uint8Array
  /** The wallet client for signing */
  walletClient: WalletClientLike
  /** Progress callback */
  onProgress?: (message: string) => void
  /** Abort signal for cancellation */
  signal?: AbortSignal
}

// ============================================================================
// Content Key Decryption
// ============================================================================

/**
 * Decrypt the AES content key using Haven-AOL.
 *
 * Full flow:
 * 1. Check AES key cache
 * 2. Build gate metadata JSON from hybrid-v1 or use native gate format
 * 3. Sign EIP-712 gate request with wallet
 * 4. Call ICP canister for encrypted VetKD key
 * 5. Recover VetKD key with ephemeral transport key
 * 6. IBE-decrypt the AES key
 * 7. Cache the AES key for replay
 *
 * @param options - Decryption options
 * @returns The decrypted AES key
 * @throws HavenAolDecryptError on failure
 */
export async function decryptContentKey(
  options: DecryptContentKeyOptions
): Promise<DecryptContentKeyResult> {
  const { encryptionMetadata, encryptedCid, walletClient, onProgress, signal } = options

  // Check cancellation
  if (signal?.aborted) {
    throw new HavenAolDecryptError('Decryption cancelled', 'CANCELLED')
  }

  // Step 0: Check AES key cache
  const videoId = getVideoIdFromMetadata(
    isHybridV1Metadata(encryptionMetadata)
      ? encryptionMetadata
      : { keyHash: encryptionMetadata.encryptedAesKey?.slice(0, 32) }
  )
  if (videoId) {
    const cached = getCachedKey(videoId)
    if (cached) {
      onProgress?.('Using cached decryption key')
      return { aesKey: cached.key, fromCache: true }
    }
  }

  // Step 1: Build gate metadata JSON
  onProgress?.('Preparing gate metadata...')
  let gateMetadataJson: string

  if (isGateMetadata(encryptionMetadata)) {
    gateMetadataJson = JSON.stringify(
      normalizeGateMetadataForDerivation(encryptionMetadata)
    )
  } else if (isHybridV1Metadata(encryptionMetadata)) {
    // Convert from hybrid-v1
    const derivationCid = resolveDerivationCid(encryptedCid, encryptionMetadata.originalHash)
    gateMetadataJson = toGateMetadataJson(encryptionMetadata, derivationCid)
  } else {
    throw new HavenAolDecryptError(
      'Invalid encryption metadata format',
      'METADATA_INVALID'
    )
  }

  if (signal?.aborted) {
    throw new HavenAolDecryptError('Decryption cancelled', 'CANCELLED')
  }

  // Step 2: Parse and validate gate metadata
  const metadata = parseGateMetadata(gateMetadataJson)

  // Step 3: Sign EIP-712 gate request
  onProgress?.('Sign with your wallet to decrypt...')
  let signedRequest = await createSignedGateRequest(walletClient)

  if (signal?.aborted) {
    throw new HavenAolDecryptError('Decryption cancelled', 'CANCELLED')
  }

  // Step 4: Create ICP agent and call canister
  onProgress?.('Requesting decryption key from network...')
  const config = getHavenAolConfig()

  const agent = await HttpAgent.create({
    host: config.host,
    identity: new AnonymousIdentity(),
  })
  if (config.fetchRootKey) {
    await agent.fetchRootKey()
  }

  // Step 5: Request decryption key from canister
  let result = await requestDecryptionKey(agent, config.canisterId, {
    chain: metadata.chain,
    tokenAddress: metadata.tokenAddress,
    threshold: metadata.threshold,
    cid: metadata.cid,
    evmAddress: walletClient.account.address,
    transportPublicKey: signedRequest.transportPublicKey,
    nonce: signedRequest.nonce,
    signature: signedRequest.signature,
    eip712ChainId: signedRequest.eip712ChainId,
    eip712VerifyingContract: signedRequest.eip712VerifyingContract,
  })

  // Handle NonceAlreadyUsed with retry
  if ('err' in result) {
    const errObj = result.err as Record<string, unknown>
    if ('NonceAlreadyUsed' in errObj) {
      onProgress?.('Nonce conflict, retrying...')
      signedRequest = await retryWithBumpedNonce(walletClient)

      result = await requestDecryptionKey(agent, config.canisterId, {
        chain: metadata.chain,
        tokenAddress: metadata.tokenAddress,
        threshold: metadata.threshold,
        cid: metadata.cid,
        evmAddress: walletClient.account.address,
        transportPublicKey: signedRequest.transportPublicKey,
        nonce: signedRequest.nonce,
        signature: signedRequest.signature,
        eip712ChainId: signedRequest.eip712ChainId,
        eip712VerifyingContract: signedRequest.eip712VerifyingContract,
      })
    }
  }

  // Check for errors
  if ('err' in result) {
    throw mapGateError(result.err)
  }

  if (signal?.aborted) {
    throw new HavenAolDecryptError('Decryption cancelled', 'CANCELLED')
  }

  // Step 6: Fetch verification key
  onProgress?.('Verifying key...')
  const verificationKeyBytes = await fetchVerificationKey(agent, config.canisterId)

  // Step 7: Compute derivation input
  const derivationInput = await computeDerivationInput(
    metadata.chain,
    metadata.tokenAddress,
    metadata.threshold,
    metadata.cid,
  )

  // Step 8: Recover VetKD key
  onProgress?.('Recovering encryption key...')
  const vetKey = recoverVetKey(
    result.ok as Uint8Array,
    signedRequest.transportSecretKey,
    verificationKeyBytes,
    derivationInput,
  )

  // Step 9: IBE-decrypt the AES key
  const aesKey = ibeDecryptAesKey(metadata.encryptedAesKey, vetKey)

  onProgress?.('Key decrypted successfully')

  // Step 10: Cache the AES key
  if (videoId && isHybridV1Metadata(encryptionMetadata)) {
    const { base64ToUint8Array } = await import('../crypto')
    const iv = base64ToUint8Array(encryptionMetadata.iv)
    setCachedKey(videoId, aesKey, iv)
  }

  return { aesKey, fromCache: false }
}

/**
 * Decrypt an encrypted CID using Haven-AOL.
 *
 * Similar to decryptContentKey but for the CID encryption layer.
 * The result is a plaintext CID string that can be used to fetch content.
 *
 * @param options - CID decryption options
 * @returns The decrypted CID string
 * @throws HavenAolDecryptError on failure
 */
export async function decryptCidWithHavenAol(
  options: DecryptCidOptions
): Promise<string> {
  const { cidEncryptionMetadata, encryptedCidData, walletClient, onProgress, signal } = options

  // Decrypt the CID encryption key
  const { aesKey } = await decryptContentKey({
    encryptionMetadata: cidEncryptionMetadata,
    walletClient,
    onProgress,
    signal,
  })

  // The encrypted CID data format: [12-byte IV][ciphertext + auth tag]
  if (encryptedCidData.length < 12) {
    throw new HavenAolDecryptError(
      'Encrypted CID data too short',
      'DECRYPTION_FAILED'
    )
  }

  const iv = encryptedCidData.slice(0, 12)
  const ciphertext = encryptedCidData.slice(12)

  // AES-GCM decrypt
  const key = await crypto.subtle.importKey(
    'raw',
    aesKey as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  )

  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      ciphertext as BufferSource,
    )

    const decoder = new TextDecoder()
    return decoder.decode(plaintext).trim()
  } catch {
    throw new HavenAolDecryptError(
      'Failed to decrypt CID. The data may be corrupted.',
      'DECRYPTION_FAILED'
    )
  }
}
