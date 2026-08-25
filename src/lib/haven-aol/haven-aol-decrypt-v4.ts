/**
 * Haven-AOL Protocol v4 — market-cap-gated drip decrypt (dapp).
 *
 * TypeScript twin of the v3 flow with one additional canister gate:
 * `requestDecryptionKeyV4` refuses until the live USD market cap of the
 * gate token (via its Chainlink oracle) reaches the chunk's
 * `marketCapTarget`. Derivation keys on
 *
 *   SHA-256("accessol_v4:" + chain + ":" + tokenAddress + ":" +
 *           threshold + ":" + effectiveEpoch + ":" + marketCapTarget)
 *
 * under the "accessol_v4" VetKD context — the target is part of the key
 * identity, so every drip chunk has an independent key even at equal
 * (community, epoch).
 *
 * Cache layers mirror v3:
 *   • per-video AES-key cache (skips IBE-decrypt)
 *   • session VetKey cache keyed by (chain, token, threshold, epoch, target)
 *
 * @module lib/haven-aol/haven-aol-decrypt-v4
 */

import {
  recoverVetKey,
  ibeDecryptAesKey,
  computeDerivationInputV4,
  type GateMetadataV4Json,
} from 'haven-aol'
import { getHavenAolConfig, getOrCreateAgent, requestDecryptionKeyV4 } from './haven-aol-client'
import {
  createSignedGateRequestV4,
  retryWithFreshV4GateNonce,
  type WalletClientLike,
} from './haven-aol-auth'
import { HavenAolDecryptError, mapGateError } from './haven-aol-errors'
import { getCachedKey, setCachedKey, getVideoIdFromMetadata } from '../aes-key-cache'

// =============================================================================
// Types
// =============================================================================

export interface DecryptContentKeyV4Options {
  /** Haven-AOL v4 gate metadata from Arkiv. */
  encryptionMetadata: GateMetadataV4Json
  /** Connected wallet client (wagmi useWalletClient shape). */
  walletClient: WalletClientLike
  /** UI progress callback. */
  onProgress?: (message: string) => void
  /** Abort signal for cancellation. */
  signal?: AbortSignal
}

export interface DecryptContentKeyV4Result {
  aesKey: Uint8Array
  fromAesCache: boolean
}

// =============================================================================
// In-flight deduplication
// =============================================================================

const inflightV4 = new Map<string, Promise<DecryptContentKeyV4Result>>()

function sessionKey(walletAddress: string, meta: GateMetadataV4Json): string {
  return `v4:${walletAddress.toLowerCase()}:${meta.encryptedAesKey}`
}

// =============================================================================
// Core: per-file decrypt
// =============================================================================

export async function decryptContentKeyV4(
  options: DecryptContentKeyV4Options
): Promise<DecryptContentKeyV4Result> {
  const { encryptionMetadata, walletClient } = options
  const address = walletClient.account.address
  if (!address) {
    throw new HavenAolDecryptError(
      'Wallet not connected. Please connect your wallet.',
      'WALLET_NOT_CONNECTED',
    )
  }

  const skey = sessionKey(address, encryptionMetadata)
  const inflight = inflightV4.get(skey)
  if (inflight) return inflight

  const task = decryptContentKeyV4Impl(options).finally(() => {
    inflightV4.delete(skey)
  })
  inflightV4.set(skey, task)
  return task
}

async function decryptContentKeyV4Impl(
  options: DecryptContentKeyV4Options
): Promise<DecryptContentKeyV4Result> {
  const { encryptionMetadata: meta, walletClient, onProgress, signal } = options
  const address = walletClient.account.address

  // Step 0: AES-key cache short-circuit.
  const videoId = getVideoIdFromMetadata({
    keyHash: meta.encryptedAesKey.slice(0, 32),
  })
  if (videoId) {
    const cached = getCachedKey(videoId)
    if (cached) {
      onProgress?.('Using cached decryption key')
      return { aesKey: cached.key, fromAesCache: true }
    }
  }

  onProgress?.('Sign with your wallet to decrypt...')
  const epochBig = BigInt(meta.epoch)
  const targetBig = BigInt(meta.marketCapTarget)
  let signed = await createSignedGateRequestV4(walletClient, epochBig, targetBig)

  onProgress?.('Checking live market cap with the network...')
  const config = getHavenAolConfig()
  const agent = await getOrCreateAgent()

  const baseRequest = {
    chain: meta.chain,
    tokenAddress: meta.tokenAddress,
    threshold: BigInt(meta.threshold),
    epoch: epochBig,
    marketCapTarget: targetBig,
    oracleAddress: meta.oracleAddress,
    evmAddress: address,
  }

  const MAX_NONCE_ATTEMPTS = 3
  let result: Awaited<ReturnType<typeof requestDecryptionKeyV4>> | null = null
  for (let attempt = 0; attempt < MAX_NONCE_ATTEMPTS; attempt++) {
    if (signal?.aborted) throw cancelled()
    result = await requestDecryptionKeyV4(agent, config.canisterId, {
      ...baseRequest,
      transportPublicKey: signed.transportPublicKey,
      nonce: signed.nonce,
      signature: signed.signature,
      eip712ChainId: signed.eip712ChainId,
      eip712VerifyingContract: signed.eip712VerifyingContract,
    })
    if (!('err' in result)) break
    const errObj = result.err as Record<string, unknown>
    // Market-cap rejections are deterministic — surface immediately so the
    // lock screen can render instead of burning signature attempts.
    if ('MarketCapNotReached' in errObj) throw mapGateError(result.err)
    if ('InvalidOracle' in errObj) throw mapGateError(result.err)
    if ('NonceAlreadyUsed' in errObj && attempt < MAX_NONCE_ATTEMPTS - 1) {
      onProgress?.('Nonce collision — please sign once more…')
      signed = await retryWithFreshV4GateNonce(walletClient, epochBig, targetBig)
      continue
    }
    throw mapGateError(result.err)
  }
  if (result == null || 'err' in result) {
    throw new HavenAolDecryptError(
      'Could not obtain a decryption key after multiple attempts. Please try again.',
      'NONCE_ALREADY_USED',
    )
  }

  if (signal?.aborted) throw cancelled()
  onProgress?.('Recovering encryption key...')

  // Derivation MUST use the same collapsed-input rule as the canister.
  // The SDK computes literal bytes; replicate the collapse here.
  const derivationInput = await computeDerivationInputV4(
    meta.chain,
    meta.tokenAddress,
    BigInt(meta.threshold),
    meta.threshold === '0' ? 0n : epochBig,
    targetBig,
  )
  const vetKey = recoverVetKey(
    result.ok.encryptedKey,
    signed.transportSecretKey,
    result.ok.verificationKey,
    derivationInput,
  )

  onProgress?.('Unwrapping content key...')
  const aesKey = ibeDecryptAesKey(meta.encryptedAesKey, vetKey)

  if (videoId) {
    setCachedKey(videoId, aesKey, new Uint8Array(12))
  }

  onProgress?.('Key decrypted successfully')
  return { aesKey, fromAesCache: false }
}

function cancelled(): HavenAolDecryptError {
  return new HavenAolDecryptError('Decryption cancelled', 'CANCELLED')
}
