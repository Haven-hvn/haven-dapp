/**
 * useVideos Hook
 *
 * React Query hook for fetching videos from Arkiv with cache-aware fetching.
 * Implements stale-while-revalidate pattern: shows cached data immediately
 * while fetching fresh data from Arkiv in the background.
 */

import { useEffect, useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAppKitAccount } from '@reown/appkit/react'
import type { Video } from '../types/video'
import { fetchAllVideos } from '../services/videoService'
import { getVideoCacheService } from '../services/cacheService'

// Query key factory for video queries
export const videoKeys = {
  all: ['videos'] as const,
  lists: () => [...videoKeys.all, 'list'] as const,
  list: (address: string | undefined) =>
    [...videoKeys.lists(), address] as const,
  details: () => [...videoKeys.all, 'detail'] as const,
  detail: (id: string) => [...videoKeys.details(), id] as const,
}

// Hook return type
export interface UseVideosReturn {
  /** Array of videos (Arkiv + cached expired) */
  videos: Video[]
  /** True if initial fetch is in progress AND no cached data available */
  isLoading: boolean
  /** True if any fetch is in progress (including background refetch) */
  isFetching: boolean
  /** True if the query encountered an error */
  isError: boolean
  /** Error object if query failed */
  error: Error | null
  /** Function to manually refetch videos */
  refetch: () => Promise<{ data: Video[] | undefined }>
  /** True if the query has successfully fetched data */
  isSuccess: boolean
}

/**
 * Hook for fetching all videos for the connected wallet.
 *
 * Features:
 * - Loads cached data immediately (no loading spinner for returning users)
 * - Fetches fresh data from Arkiv in the background
 * - Merges Arkiv data with cached expired entities
 * - Handles wallet connection state
 *
 * @returns UseVideosReturn with videos, loading states, and refetch function
 */
export function useVideos(): UseVideosReturn {
  const { address, isConnected } = useAppKitAccount()
  const [initialData, setInitialData] = useState<Video[] | undefined>(undefined)

  // Load cached data on mount (before React Query fires)
  useEffect(() => {
    if (address) {
      const cacheService = getVideoCacheService(address)
      cacheService
        .getVideos()
        .then((cached) => {
          if (cached.length > 0) {
            setInitialData(cached)
          }
        })
        .catch(() => {
          // Cache read failed, no initial data
        })
    }
  }, [address])

  const query = useQuery({
    queryKey: videoKeys.list(address),
    queryFn: async () => {
      if (!address) throw new Error('Wallet not connected')
      return fetchAllVideos(address) // Now cache-aware
    },
    enabled: isConnected && !!address,
    staleTime: 5 * 60 * 1000, // 5 minutes
    // Use cached data as placeholder while fetching
    placeholderData: initialData,
    refetchOnWindowFocus: true,
  })

  return {
    videos: query.data || initialData || [],
    isLoading: query.isLoading && !initialData, // Not "loading" if we have cache
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: query.refetch,
    isSuccess: query.isSuccess,
  }
}

// Hook return type for single video query
export interface UseVideoQueryReturn {
  /** The video object if found */
  video: Video | null | undefined
  /** True if initial fetch is in progress */
  isLoading: boolean
  /** True if any fetch is in progress (including background refetch) */
  isFetching: boolean
  /** True if the query encountered an error */
  isError: boolean
  /** Error object if query failed */
  error: Error | null
  /** Function to manually refetch the video */
  refetch: () => Promise<{ data: Video | null | undefined }>
  /** True if video was found (not null/undefined) */
  isFound: boolean
}

/**
 * Hook for fetching a single video by ID.
 *
 * Uses cache-aware fetch when owner address is known, enabling
 * fallback to cache for expired entities.
 *
 * @param videoId - The video entity key to fetch
 * @param enabled - Whether the query should be enabled (default: true)
 * @returns UseVideoQueryReturn with video data and loading states
 */
export function useVideoQuery(
  videoId: string,
  enabled: boolean = true
): UseVideoQueryReturn {
  const { address } = useAppKitAccount()

  const query = useQuery({
    queryKey: videoKeys.detail(videoId),
    queryFn: async () => {
      // Import here to avoid circular dependencies
      const { fetchVideoByIdWithCache, fetchVideoById } = await import(
        '../services/videoService'
      )

      // Use cache-aware fetch when we have the owner address
      if (address) {
        return fetchVideoByIdWithCache(videoId, address)
      }
      return fetchVideoById(videoId)
    },
    enabled: enabled && !!videoId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  return {
    video: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: query.refetch,
    isFound: !!query.data,
  }
}

/**
 * Alias for useVideoQuery for backward compatibility
 * @deprecated Use useVideoQuery instead
 */
export const useVideo = useVideoQuery

// Hook return type for invalidation
export interface UseInvalidateVideosReturn {
  /** Invalidate video queries to trigger re-fetch */
  invalidate: () => Promise<void>
  /** Invalidate a specific video query */
  invalidateVideo: (videoId: string) => Promise<void>
  /** Reset all video queries (clears cache) */
  reset: () => void
}

/**
 * Hook for invalidating video queries.
 *
 * Triggers React Query invalidation which causes re-fetch from Arkiv.
 * Note: Does NOT clear IndexedDB cache - that's long-term storage.
 *
 * @returns UseInvalidateVideosReturn with invalidation functions
 */
export function useInvalidateVideos(): UseInvalidateVideosReturn {
  const queryClient = useQueryClient()
  const { address } = useAppKitAccount()

  const invalidate = useCallback(async () => {
    // Invalidate React Query cache
    await queryClient.invalidateQueries({
      queryKey: videoKeys.list(address),
    })
    // Note: We do NOT clear IndexedDB cache on invalidation.
    // IndexedDB is long-term storage; React Query invalidation
    // just triggers a re-fetch from Arkiv which will sync to cache.
  }, [queryClient, address])

  const invalidateVideo = useCallback(
    async (videoId: string) => {
      await queryClient.invalidateQueries({
        queryKey: videoKeys.detail(videoId),
      })
    },
    [queryClient]
  )

  const reset = useCallback(() => {
    queryClient.removeQueries({
      queryKey: videoKeys.all,
    })
  }, [queryClient])

  return {
    invalidate,
    invalidateVideo,
    reset,
  }
}
