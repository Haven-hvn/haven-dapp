/**
 * Haven-AOL Authentication
 *
 * Handles EIP-712 signature flow for Haven-AOL gate requests.
 * Creates ephemeral transport key pairs and builds typed data
 * for wallet signing.
 *
 * @module lib/haven-aol/haven-aol-auth
 */

import {
  createTransportKeyPair,
  buildGateRequestTypedData,
  parseSignatureHex,
} from 'haven-aol'

/** Ephemeral VetKD transport secret key (from haven-aol / vetkeys). */
type TransportSecretKey = ReturnType<typeof createTransportKeyPair>['secretKey']
import { getHavenAolConfig } from './haven-aol-client'
import { createRandomGateNonce } from './haven-aol-nonce'
import { HavenAolDecryptError } from './haven-aol-errors'

// ============================================================================
// Types
// ============================================================================

/**
 * Result of the EIP-712 signing flow.
 * Contains everything needed to call decryptGatedFile or requestDecryptionKey.
 */
export interface SignedGateRequest {
  /** Ephemeral transport secret key for VetKD unwrap */
  transportSecretKey: TransportSecretKey
  /** Ephemeral transport public key bytes */
  transportPublicKey: Uint8Array
  /** The nonce used in the signature */
  nonce: bigint
  /** The raw signature bytes (65 bytes) */
  signature: Uint8Array
  /** EIP-712 chain ID */
  eip712ChainId: bigint
  /** EIP-712 verifying contract */
  eip712VerifyingContract: string
}

/**
 * Wallet client interface (compatible with wagmi's useWalletClient).
 */
export interface WalletClientLike {
  account: {
    address: string
  }
  signTypedData: (args: {
    domain: Record<string, unknown>
    types: Record<string, unknown[]>
    primaryType: string
    message: Record<string, unknown>
  }) => Promise<string>
}

// ============================================================================
// Core Auth Flow
// ============================================================================

export interface CreateSignedGateRequestOptions {
  /**
   * Explicit nonce (retry after rare canister `NonceAlreadyUsed`).
   * When omitted, a random 256-bit nonce is generated.
   */
  nonce?: bigint
}

/**
 * Create a signed gate request using the connected wallet.
 */
export async function createSignedGateRequest(
  walletClient: WalletClientLike,
  options?: CreateSignedGateRequestOptions
): Promise<SignedGateRequest> {
  const config = getHavenAolConfig()
  const address = walletClient.account.address

  if (!address) {
    throw new HavenAolDecryptError(
      'Wallet not connected. Please connect your wallet.',
      'WALLET_NOT_CONNECTED'
    )
  }

  const { secretKey, publicKey } = createTransportKeyPair()
  const nonce = options?.nonce ?? createRandomGateNonce()

  const typedData = buildGateRequestTypedData({
    evmAddress: address,
    transportPublicKey: publicKey,
    nonce,
    eip712ChainId: config.eip712ChainId,
    eip712VerifyingContract: config.eip712VerifyingContract,
  })

  let signatureHex: string
  try {
    signatureHex = await walletClient.signTypedData({
      domain: typedData.domain as unknown as Record<string, unknown>,
      types: typedData.types as unknown as Record<string, unknown[]>,
      primaryType: typedData.primaryType,
      message: typedData.message as unknown as Record<string, unknown>,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.includes('rejected') || msg.includes('denied') || msg.includes('cancelled')) {
      throw new HavenAolDecryptError(
        'Signature request was rejected. Please approve the signature to decrypt the video.',
        'SIGNING_REJECTED'
      )
    }
    throw new HavenAolDecryptError(
      `Failed to sign gate request: ${msg}`,
      'SIGNING_REJECTED'
    )
  }

  const signature = parseSignatureHex(signatureHex)

  return {
    transportSecretKey: secretKey,
    transportPublicKey: publicKey,
    nonce,
    signature,
    eip712ChainId: config.eip712ChainId,
    eip712VerifyingContract: config.eip712VerifyingContract,
  }
}

// ============================================================================
// Batch Auth Flow
// ============================================================================

/**
 * Result of the batch EIP-712 signing flow.
 * Contains everything needed to call batchRequestDecryptionKey.
 */
export interface SignedBatchGateRequest {
  /** Ephemeral transport secret key for VetKD unwrap */
  transportSecretKey: TransportSecretKey
  /** Ephemeral transport public key bytes */
  transportPublicKey: Uint8Array
  /** The nonce used in the signature */
  nonce: bigint
  /** The raw signature bytes (65 bytes) */
  signature: Uint8Array
  /** EIP-712 chain ID */
  eip712ChainId: bigint
  /** EIP-712 verifying contract */
  eip712VerifyingContract: string
  /** Pre-computed keccak256(transportPublicKey) — used in EIP-712 */
  transportKeyHash: Uint8Array
  /** Pre-computed cidsCommitment — used in EIP-712 */
  cidsCommitment: Uint8Array
}

/**
 * Create a signed batch gate request using the connected wallet.
 *
 * Computes transportKeyHash and cidsCommitment from the provided CIDs,
 * builds EIP-712 typed data for BatchGateRequest, and signs with wallet.
 */
export async function createSignedBatchGateRequest(
  walletClient: WalletClientLike,
  cids: string[],
  gateParams: { chain: string; tokenAddress: string; threshold: bigint },
  options?: { nonce?: bigint }
): Promise<SignedBatchGateRequest> {
  const { keccak256, encodePacked } = await import('viem')
  const { computeDerivationInput, buildBatchGateRequestTypedData, parseSignatureHex } = await import('haven-aol')

  const config = getHavenAolConfig()
  const address = walletClient.account.address

  if (!address) {
    throw new HavenAolDecryptError(
      'Wallet not connected. Please connect your wallet.',
      'WALLET_NOT_CONNECTED'
    )
  }

  const { secretKey, publicKey } = createTransportKeyPair()
  const nonce = options?.nonce ?? createRandomGateNonce()

  // Compute transportKeyHash = keccak256(transportPublicKey)
  const transportKeyHash = keccak256(publicKey, 'bytes')

  // Compute cidsCommitment = keccak256(abi.encodePacked(derivationInput₁, derivationInput₂, ...))
  const derivationInputs = await Promise.all(
    cids.map((cid) =>
      computeDerivationInput(
        gateParams.chain as Parameters<typeof computeDerivationInput>[0],
        gateParams.tokenAddress,
        gateParams.threshold,
        cid
      )
    )
  )
  const packed = encodePacked(
    derivationInputs.map(() => 'bytes32' as const),
    derivationInputs.map((di) => `0x${Array.from(di).map(b => b.toString(16).padStart(2, '0')).join('')}` as `0x${string}`)
  )
  const cidsCommitment = keccak256(packed, 'bytes')

  const typedData = buildBatchGateRequestTypedData({
    evmAddress: address,
    transportKeyHash,
    cidsCommitment,
    nonce,
    eip712ChainId: config.eip712ChainId,
    eip712VerifyingContract: config.eip712VerifyingContract,
  })

  let signatureHex: string
  try {
    signatureHex = await walletClient.signTypedData({
      domain: typedData.domain as unknown as Record<string, unknown>,
      types: typedData.types as unknown as Record<string, unknown[]>,
      primaryType: typedData.primaryType,
      message: typedData.message as unknown as Record<string, unknown>,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.includes('rejected') || msg.includes('denied') || msg.includes('cancelled')) {
      throw new HavenAolDecryptError(
        'Signature request was rejected. Please approve the signature to decrypt the videos.',
        'SIGNING_REJECTED'
      )
    }
    throw new HavenAolDecryptError(
      `Failed to sign batch gate request: ${msg}`,
      'SIGNING_REJECTED'
    )
  }

  const signature = parseSignatureHex(signatureHex)

  return {
    transportSecretKey: secretKey,
    transportPublicKey: publicKey,
    nonce,
    signature,
    eip712ChainId: config.eip712ChainId,
    eip712VerifyingContract: config.eip712VerifyingContract,
    transportKeyHash,
    cidsCommitment,
  }
}

// ============================================================================
// Retry Helpers
// ============================================================================

/**
 * Re-sign with a fresh random nonce (after rare `NonceAlreadyUsed` from the canister).
 */
export async function retryWithFreshGateNonce(
  walletClient: WalletClientLike
): Promise<SignedGateRequest> {
  return createSignedGateRequest(walletClient, { nonce: createRandomGateNonce() })
}

/**
 * @deprecated Use {@link retryWithFreshGateNonce}.
 */
export async function retryWithBumpedNonce(
  walletClient: WalletClientLike,
  _collidedNonce?: bigint
): Promise<SignedGateRequest> {
  return retryWithFreshGateNonce(walletClient)
}
