/**
 * V4 IBE key wrapping — publisher side of the VetKD handshake.
 *
 * The uploader wraps each drip chunk's AES content key to the canister's
 * v1 per-CID identity:
 *
 *   identity = SHA-256("accessol:" + chain + ":" + tokenAddress + ":"
 *                      + threshold + ":" + cid)
 *
 * Because the CID differs per chunk, every chunk gets an independent key
 * while readers keep using the unchanged deployed-canister
 * `requestDecryptionKey` endpoint (hold `threshold` of `tokenAddress` →
 * derive the key for that identity).
 *
 * The derived public key (BLS12-381 G2 point) is fetched once from the
 * canister's `getVetKDPublicKeyV4` query and cached for the session.
 *
 * @module lib/v4/ibe-wrap
 */

import {
  DerivedPublicKey,
  IbeCiphertext,
  IbeIdentity,
  IbeSeed,
} from '@icp-sdk/vetkeys'
import {
  computeDerivationInputV4,
  fetchVerificationKeyV4,
  type Chain,
} from 'haven-aol'
import { getHavenAolConfig, getOrCreateAgent } from '../haven-aol/haven-aol-client'

// ============================================================================
// Derived public key cache
// ============================================================================

let cachedDpk: DerivedPublicKey | null = null
let dpkInflight: Promise<DerivedPublicKey> | null = null

/**
 * Fetch (once) and deserialize the canister's **v4** VetKD derived public
 * key ("accessol_v4" context).
 *
 * CRITICAL: drip publishers MUST wrap content keys under THIS key — the
 * canister's `requestDecryptionKeyV4` derives under the v4 context, so a
 * ciphertext wrapped under the v1 dpk could never be unwrapped by readers.
 * Traps server-side until `warmupVetKDPublicKeyV4` has run once post-deploy.
 */
export async function getDerivedPublicKey(): Promise<DerivedPublicKey> {
  if (cachedDpk) return cachedDpk
  if (dpkInflight) return dpkInflight

  dpkInflight = (async () => {
    const agent = await getOrCreateAgent()
    const config = getHavenAolConfig()
    // `as never` bridges duplicate @icp-sdk/core copies between the dapp and
    // the haven-aol SDK checkout (same wire protocol, distinct declarations).
    const verificationKey = await fetchVerificationKeyV4(
      agent as never,
      config.canisterId
    )
    return DerivedPublicKey.deserialize(verificationKey)
  })()

  try {
    cachedDpk = await dpkInflight
    return cachedDpk
  } finally {
    dpkInflight = null
  }
}

/** Clear the dpk cache (tests / config changes). */
export function clearDerivedPublicKeyCache(): void {
  cachedDpk = null
  dpkInflight = null
}

// ============================================================================
// Derivation input
// ============================================================================

export interface DripGateIdentity {
  chain: Chain
  tokenAddress: string
  threshold: bigint
  /** Epoch at publish time — frozen into the chunk metadata. */
  epoch: bigint
  /** Whole-USD unlock target for THIS chunk. */
  marketCapTarget: bigint
  /** Piece CID of THIS chunk. */
  cid: string
}

/**
 * Compute the v4 derivation input for a drip chunk.
 *
 * Preimage: "accessol_v4:" + chain + ":" + tokenAddress + ":" + threshold +
 * ":" + epoch + ":" + marketCapTarget (byte-identical to the canister's
 * `computeDerivationInputV4` and pinned by
 * haven-aol tests/fixtures/derivation-v4-vectors.json).
 *
 * NOTE: the SDK computes literal bytes; the canister collapses epoch to 0
 * when threshold==0. Drip publishers always use threshold >= 1, so the
 * literal form matches; a collapse here would desync publisher and reader.
 */
export function computeDripDerivationInput(gate: DripGateIdentity): Promise<Uint8Array> {
  return computeDerivationInputV4(
    gate.chain,
    gate.tokenAddress,
    gate.threshold,
    gate.epoch,
    gate.marketCapTarget,
  )
}

// ============================================================================
// Wrapping
// ============================================================================

/**
 * IBE-wrap a 32-byte AES key to `identity` using the session dpk
 * (fetched from the canister on first use).
 * Returns standard base64 — exactly what `GateMetadataJson.encryptedAesKey`
 * carries and `ibeDecryptAesKey` consumes.
 */
export async function wrapAesKey(
  aesKey: Uint8Array,
  identity: Uint8Array
): Promise<string> {
  const [dpk] = await Promise.all([getDerivedPublicKey()])
  return wrapAesKeyWithDpk(aesKey, identity, dpk)
}

/**
 * IBE-wrap with an explicit derived public key.
 * Split out so tests can exercise real IBE encryption offline (pocket-ic
 * master-key derivation) without touching the network.
 */
export function wrapAesKeyWithDpk(
  aesKey: Uint8Array,
  identity: Uint8Array,
  dpk: DerivedPublicKey
): string {
  if (aesKey.length !== 32) {
    throw new Error(`AES key must be 32 bytes, got ${aesKey.length}`)
  }

  const ibeIdentity = IbeIdentity.fromBytes(identity)
  const seed = IbeSeed.random()

  const ciphertext = IbeCiphertext.encrypt(dpk, ibeIdentity, aesKey, seed)
  return toBase64(ciphertext.serialize())
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  // btoa exists in all browsers and Node >= 16 (global); vitest jsdom/node fine.
  return btoa(binary)
}
