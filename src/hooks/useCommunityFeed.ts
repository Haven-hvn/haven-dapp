/**
 * Community Feed Hook
 *
 * React Query hook for fetching and verifying the community feed.
 * Discovers user's token communities, fetches all gated content,
 * and verifies attestation signatures offline.
 *
 * @module hooks/useCommunityFeed
 */

'use client'

import { useQuery } from '@tanstack/react-query'
import { useAppKitAccount } from '@reown/appkit/react'
import { getArkivClient } from '@/lib/arkiv-singleton'
import {
  discoverUserCommunities,
  fetchFullCommunityFeed,
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
  feed: (address: string | undefined) =>
    [...communityKeys.all, 'feed', address] as const,
}

// ============================================================================
// Hook Types
// ============================================================================

export interface UseCommunityFeedReturn {
  /** All verified videos in the community feed */
  videos: CommunityVideo[]
  /** All token gates the user belongs to */
  communities: TokenGate[]
  /** Loading state */
  isLoading: boolean
  /** Error if feed fetch failed */
  error: Error | null
  /** Refetch the feed */
  refetch: () => void
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * React hook for the community feed.
 *
 * Flow:
 * 1. Discover user's token communities (from their own gated entities)
 * 2. Fetch feed for all discovered communities (parallel Arkiv queries)
 * 3. Verify attestation signatures offline (pure CPU)
 * 4. Return only verified, sorted by recency
 *
 * @returns Community feed data, loading state, and refetch function
 */
export function useCommunityFeed(): UseCommunityFeedReturn {
  const { address, isConnected } = useAppKitAccount()
  const client = getArkivClient()

  // Step 1: Discover communities
  const communitiesQuery = useQuery({
    queryKey: communityKeys.communities(address),
    queryFn: () => discoverUserCommunities(client, address!),
    enabled: isConnected && !!address,
    staleTime: 5 * 60 * 1000, // 5 min — communities don't change fast
  })

  // Step 2: Fetch + verify feed
  const feedQuery = useQuery({
    queryKey: communityKeys.feed(address),
    queryFn: async () => {
      const gates = communitiesQuery.data!
      const videos = await fetchFullCommunityFeed(client, gates)
      const verified = await verifyFeed(videos)

      // Sort by recency, verified first
      return verified.sort((a, b) => {
        // Verified content ranks higher
        if (a.verified !== b.verified) return a.verified ? -1 : 1
        // Then by recency
        return b.createdAtBlock - a.createdAtBlock
      })
    },
    enabled: isConnected && !!address && !!communitiesQuery.data?.length,
    staleTime: 2 * 60 * 1000, // 2 min — feed refreshes more often
  })

  return {
    videos: feedQuery.data || [],
    communities: communitiesQuery.data || [],
    isLoading: communitiesQuery.isLoading || feedQuery.isLoading,
    error: (communitiesQuery.error || feedQuery.error || null) as Error | null,
    refetch: feedQuery.refetch,
  }
}
