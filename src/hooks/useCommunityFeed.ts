/**
 * Community Feed Hooks
 *
 * Two hooks for the community feature:
 * - useUserCommunities: discovers which token communities the user belongs to
 * - useCommunityFeedForGate: fetches + verifies videos for a specific token gate
 *
 * @module hooks/useCommunityFeed
 */

'use client'

import { useQuery } from '@tanstack/react-query'
import { useAppKitAccount } from '@reown/appkit/react'
import { getArkivClient } from '@/lib/arkiv-singleton'
import {
  discoverUserCommunities,
  fetchCommunityFeedForToken,
  verifyFeed,
} from '@/lib/community-feed'
import {
  discoverGates,
  satisfiedGateKeys,
  checkGateAccess,
  gateKey,
} from '@/lib/gate-access'
import type { CommunityVideo, TokenGate } from '@/types/attestation'

// ============================================================================
// Query Keys
// ============================================================================

export const communityKeys = {
  all: ['community'] as const,
  communities: (address: string | undefined) =>
    [...communityKeys.all, 'communities', address] as const,
  feed: (address: string | undefined, gateToken?: string) =>
    [...communityKeys.all, 'feed', address, gateToken] as const,
}

// ============================================================================
// Hook Types
// ============================================================================

export interface UseUserCommunitiesReturn {
  /** All token gates the user belongs to */
  communities: TokenGate[]
  /** Loading state */
  isLoading: boolean
  /** Error if communities fetch failed */
  error: Error | null
  /** Refetch communities */
  refetch: () => void
}

export interface UseCommunityFeedForGateReturn {
  /** Verified videos for this gate */
  videos: CommunityVideo[]
  /** Loading state */
  isLoading: boolean
  /** Error if feed fetch failed */
  error: Error | null
  /** Refetch the feed */
  refetch: () => void
}

// ============================================================================
// Hook: useUserCommunities
// ============================================================================

/**
 * Discover which token communities the user belongs to.
 *
 * Two sources, merged: gates on the user's own uploads (creator view),
 * and every gate recorded on Arkiv that the wallet's balances satisfy
 * (consumer view — a holder who never uploaded belongs here). The
 * holdings half fails soft: an RPC outage must not hide communities
 * the user created.
 *
 * @returns TokenGate list, loading state, and refetch function
 */
export function useUserCommunities(): UseUserCommunitiesReturn {
  const { address, isConnected } = useAppKitAccount()
  const client = getArkivClient()

  const query = useQuery({
    queryKey: communityKeys.communities(address),
    queryFn: async () => {
      const own = await discoverUserCommunities(client, address!)
      try {
        const discovered = await discoverGates(client)
        const satisfied = await satisfiedGateKeys(address!, discovered)
        const held = discovered.filter((g) => satisfied.has(gateKey(g)))
        const byKey = new Map<string, TokenGate>()
        for (const gate of [...own, ...held]) byKey.set(gateKey(gate), gate)
        return [...byKey.values()]
      } catch {
        return own
      }
    },
    enabled: isConnected && !!address,
    staleTime: 5 * 60 * 1000,
  })

  return {
    communities: query.data || [],
    isLoading: query.isLoading,
    error: (query.error || null) as Error | null,
    refetch: () => { query.refetch() },
  }
}

// ============================================================================
// Hook: useCommunityFeedForGate
// ============================================================================

/**
 * Fetch and verify community feed for a specific token gate.
 * Uses the gate's token address to query Arkiv for all matching entities.
 *
 * @param gateTokenAddress - The token contract address (e.g. "0x...")
 * @returns CommunityVideo list, loading state, and refetch function
 */
export function useCommunityFeedForGate(
  gateTokenAddress: string | null
): UseCommunityFeedForGateReturn {
  const { address, isConnected } = useAppKitAccount()
  const client = getArkivClient()

  const query = useQuery({
    queryKey: communityKeys.feed(address, gateTokenAddress ?? undefined),
    queryFn: async () => {
      if (!gateTokenAddress) return []

      const gate: TokenGate = {
        tokenAddress: gateTokenAddress,
        chain: '',
        threshold: 1,
      }

      const videos = await fetchCommunityFeedForToken(client, gate, 50)
      const verified = await verifyFeed(videos)

      return verified.sort((a, b) => {
        if (a.verified !== b.verified) return a.verified ? -1 : 1
        return b.createdAtBlock - a.createdAtBlock
      })
    },
    enabled: isConnected && !!address && !!gateTokenAddress,
    staleTime: 2 * 60 * 1000,
  })

  return {
    videos: query.data || [],
    isLoading: query.isLoading,
    error: (query.error || null) as Error | null,
    refetch: () => { query.refetch() },
  }
}

export interface UseGateAccessReturn {
  /** True when the connected wallet's live balance satisfies the gate. */
  holds: boolean
  /** Raw base-unit balance, or null when unread / not yet loaded. */
  balance: bigint | null
  isLoading: boolean
  /** Re-read balances (e.g. after acquiring the token). */
  refetch: () => void
}

/**
 * Live membership check for one gate: `balanceOf` vs threshold, read
 * fresh from chain. This — not "has uploaded here" — is what makes a
 * user a member of a token-gated community.
 */
export function useGateAccess(gate: TokenGate | null): UseGateAccessReturn {
  const { address, isConnected } = useAppKitAccount()

  const query = useQuery({
    queryKey: [...communityKeys.all, 'gate-access', address, gate ? gateKey(gate) : undefined, gate?.threshold],
    queryFn: () => checkGateAccess(address!, gate!),
    enabled: isConnected && !!address && !!gate && !!gate.chain,
    staleTime: 30 * 1000,
  })

  return {
    holds: query.data?.holds ?? false,
    balance: query.data?.balance ?? null,
    isLoading: query.isLoading,
    refetch: () => { query.refetch() },
  }
}
