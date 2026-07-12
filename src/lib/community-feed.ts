/**
 * Community Feed Queries & Verification
 *
 * Discovers user's token communities, fetches community feed entities
 * from Arkiv, and verifies attestation signatures offline (pure CPU).
 *
 * @module lib/community-feed
 */

import { fetchAttestationPublicKey } from 'haven-aol'
import { getOrCreateAgent, getHavenAolConfig } from './haven-aol/haven-aol-client'
import { parseEntityPayload } from './arkiv'
import {
  verifyAttestation,
  verifyMerkleAttestation,
  attestationMatchesEntity,
} from './attestation'
import {
  isMerkleAttestation,
  type Attestation,
  type CommunityVideo,
  type TokenGate,
} from '@/types/attestation'
import type { PublicArkivClient, Entity } from '@arkiv-network/sdk'
import { eq } from '@arkiv-network/sdk/query'
import type { Transport, Chain } from 'viem'

// ============================================================================
// Canister Public Key (cached globally)
// ============================================================================

let cachedCanisterPubKey: Uint8Array | null = null

/**
 * Fetch the canister's attestation public key. Cached after first call.
 * This is the only ICP network call required — subsequent verifications are offline.
 */
export async function getCanisterAttestPublicKey(): Promise<Uint8Array> {
  if (cachedCanisterPubKey) return cachedCanisterPubKey

  const agent = await getOrCreateAgent()
  const config = getHavenAolConfig()
  const pubKeyBytes = await fetchAttestationPublicKey(agent, config.canisterId)
  cachedCanisterPubKey = pubKeyBytes
  return pubKeyBytes
}

/**
 * Clear the cached attestation public key (for testing or config changes).
 */
export function clearAttestPublicKeyCache(): void {
  cachedCanisterPubKey = null
}

// ============================================================================
// Discover User's Communities
// ============================================================================

/**
 * Discover which token communities the user belongs to.
 * Queries user's own entities for unique gate_token values.
 */
export async function discoverUserCommunities(
  client: PublicArkivClient<Transport, Chain | undefined, undefined>,
  walletAddress: string
): Promise<TokenGate[]> {
  const result = await client
    .buildQuery()
    .where([eq('project', 'haven'), eq('type', 'video')])
    .ownedBy(walletAddress.toLowerCase() as `0x${string}`)
    .withAttributes(true)
    .limit(200)
    .fetch()

  const gateMap = new Map<string, TokenGate>()

  for (const entity of result.entities) {
    const attrs = entity.attributes
    if (!attrs || attrs.length === 0) continue

    const gateToken = attrs.find((a) => a.key === 'gate_token')?.value as string | undefined
    const gateChain = attrs.find((a) => a.key === 'gate_chain')?.value as string | undefined
    const gateThreshold = attrs.find((a) => a.key === 'gate_threshold')?.value as number | undefined

    if (gateToken && gateChain) {
      const key = `${gateChain}:${gateToken}`
      if (!gateMap.has(key)) {
        gateMap.set(key, {
          tokenAddress: gateToken,
          chain: gateChain,
          threshold: gateThreshold || 1,
        })
      }
    }
  }

  return [...gateMap.values()]
}

// ============================================================================
// Fetch Community Feed
// ============================================================================

/**
 * Fetch community feed for a specific token gate.
 * Returns entities from all creators who gated content with this token.
 */
export async function fetchCommunityFeedForToken(
  client: PublicArkivClient<Transport, Chain | undefined, undefined>,
  gate: TokenGate,
  limit: number = 20
): Promise<CommunityVideo[]> {
  const result = await client
    .buildQuery()
    .where([
      eq('project', 'haven'),
      eq('type', 'video'),
      eq('gate_token', gate.tokenAddress),
    ])
    .orderBy('$createdAtBlock', 'number', 'desc')
    .withPayload(true)
    .withAttributes(true)
    .withMetadata(true)
    .limit(limit)
    .fetch()

  return result.entities.map((entity: Entity) => {
    // Entity payload is Uint8Array — decode to base64 for parseEntityPayload
    let payloadStr = ''
    if (entity.payload) {
      const bytes = new Uint8Array(entity.payload)
      const binary = bytes.reduce((acc, byte) => acc + String.fromCharCode(byte), '')
      payloadStr = typeof window !== 'undefined' ? btoa(binary) : Buffer.from(bytes).toString('base64')
    }

    const payload = parseEntityPayload<Record<string, unknown>>(payloadStr) || {}
    const attestation = (payload.attestation as Attestation | undefined) || null

    const attrs = entity.attributes || []
    const getAttr = (key: string): string | number | undefined =>
      attrs.find((a) => a.key === key)?.value

    // Surface the entity's own bound fields so verifyFeed can cross-check
    // the attestation against them. The query-time `gate` is what the caller
    // *asked* for; the entity's attributes are what it actually claims.
    const entityCidHash = (getAttr('cid_hash') as string) || null
    const entityGateThreshold = getAttr('gate_threshold') as number | undefined
    const entityGateChain = getAttr('gate_chain') as string | undefined

    return {
      id: entity.key,
      title: (getAttr('title') as string) || 'Untitled',
      owner: (entity.owner || '').toLowerCase(),
      creatorAddress: (entity.creator || entity.owner || '').toLowerCase(),
      gateToken: gate.tokenAddress,
      gateChain: entityGateChain ?? gate.chain,
      gateThreshold: entityGateThreshold ?? gate.threshold,
      createdAtBlock: entity.createdAtBlock ? Number(entity.createdAtBlock) : 0,
      isEncrypted: getAttr('is_encrypted') === 1,
      cidHash: entityCidHash,
      attestation,
      verified: false, // Set in verification step
    }
  })
}

/**
 * Fetch merged community feed across all user's token gates.
 * Queries in parallel for speed.
 */
export async function fetchFullCommunityFeed(
  client: PublicArkivClient<Transport, Chain | undefined, undefined>,
  gates: TokenGate[],
  limitPerToken: number = 20
): Promise<CommunityVideo[]> {
  const feedPromises = gates.map((gate) =>
    fetchCommunityFeedForToken(client, gate, limitPerToken)
  )

  const feeds = await Promise.all(feedPromises)
  return feeds.flat()
}

// ============================================================================
// Verify Feed Attestations (Offline)
// ============================================================================

/**
 * Verify all attestations in a community feed. Pure CPU, no RPC calls
 * (except the one-time canister public key fetch which is cached).
 *
 * @returns The same videos with `verified` field set to true/false
 */
export async function verifyFeed(
  videos: CommunityVideo[]
): Promise<CommunityVideo[]> {
  const canisterPubKey = await getCanisterAttestPublicKey()

  return videos.map((video) => {
    if (!video.attestation) {
      return { ...video, verified: false }
    }

    // 1. Verify signature is valid and not expired. v2 batch attestations
    //    carry a `merkleProof` + `merkleRoot` and are verified by
    //    reconstructing the proof to the signed root; legacy single-CID
    //    attestations are verified directly against the leaf preimage.
    const sigValid = isMerkleAttestation(video.attestation)
      ? verifyMerkleAttestation(video.attestation, canisterPubKey)
      : verifyAttestation(video.attestation, canisterPubKey)

    // 2. Verify attestation matches this entity (anti-replay).
    //    cid_hash binds the attestation to specific content — without it, an
    //    attacker can copy any valid attestation onto a different entity.
    const entityMatch = attestationMatchesEntity(video.attestation, {
      creator: video.creatorAddress,
      attributes: {
        gate_token: video.gateToken,
        gate_chain: video.gateChain,
        gate_threshold: video.gateThreshold,
        cid_hash: video.cidHash ?? undefined,
      },
    })

    return { ...video, verified: sigValid && entityMatch }
  })
}
