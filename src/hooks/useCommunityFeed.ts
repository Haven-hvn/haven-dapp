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
 * Queries the user's own Arkiv entities for unique gate_token values.
 *
 * @returns TokenGate list, loading state, and refetch function
 */
export function useUserCommunities(): UseUserCommunitiesReturn {
  const { address, isConnected } = useAppKitAccount()
  const client = getArkivClient()

  const query = useQuery({
    queryKey: communityKeys.communities(address),
    queryFn: () => discoverUserCommunities(client, address!),
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
