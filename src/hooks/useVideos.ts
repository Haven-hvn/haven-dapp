'use client'

/**
 * Video Query Hooks
 * 
 * React Query hooks for fetching and managing video data from Arkiv.
 * Provides caching, automatic refetching, and optimistic updates.
 * 
 * @module hooks/useVideos
 */

import { 
  useQuery, 
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query'
import { useAppKitAccount } from '@reown/appkit/react'
import { useCallback } from 'react'
import { 
  fetchVideos,
  fetchAllVideos, 
  fetchVideoById,
  getVideoErrorMessage,
} from '@/services/videoService'
import type { Video } from '@/types'

// ============================================================================
// Query Keys
// ============================================================================

/**
 * Query key factory for video queries.
 * Provides type-safe query key generation.
 */
export const videoKeys = {
  all: ['videos'] as const,
  lists: () => [...videoKeys.all, 'list'] as const,
  list: (address: string | undefined) => 
    [...videoKeys.lists(), { address }] as const,
  details: () => [...videoKeys.all, 'detail'] as const,
  detail: (id: string) => [...videoKeys.details(), id] as const,
}

// ============================================================================
// useVideos Hook
// ============================================================================

export interface UseVideosReturn {
  /** Array of videos (empty if loading or error) */
  videos: Video[]
  /** Whether initial fetch is in progress */
  isLoading: boolean
  /** Whether background refetch is in progress */
  isFetching: boolean
  /** Whether the last fetch resulted in an error */
  isError: boolean
  /** Error object if fetch failed */
  error: Error | null
  /** Manually refetch videos */
  refetch: () => Promise<UseQueryResult<Video[], Error>>
  /** Whether videos have been successfully loaded */
  isSuccess: boolean
}

/**
 * Hook for fetching all videos for the connected wallet.
 * 
 * Automatically:
 * - Fetches videos when wallet is connected
 * - Refetches when wallet address changes
 * - Caches results for 5 minutes
 * - Shows stale data while refetching
 * 
 * @returns Video data and loading states
 * 
 * @example
 * ```tsx
 * function VideoLibrary() {
 *   const { videos, isLoading, isError, error } = useVideos()
 *   
 *   if (isLoading) return <LoadingGrid />
 *   if (isError) return <ErrorMessage error={error} />
 *   
 *   return <VideoGrid videos={videos} />
 * }
 * ```
 */
export function useVideos(): UseVideosReturn {
  const { address, isConnected } = useAppKitAccount()

  const query = useQuery({
    queryKey: videoKeys.list(address),
    queryFn: async () => {
      if (!address) {
        throw new Error('Wallet not connected')
      }
      return fetchAllVideos(address)
    },
    // Only enabled when wallet is connected and we have an address
    enabled: isConnected && !!address,
    // Keep data fresh for 5 minutes
    staleTime: 5 * 60 * 1000,
    // Consider data fresh for 30 seconds to prevent rapid refetching
    refetchInterval: false,
    // Refetch when window regains focus (user may have switched wallets)
    refetchOnWindowFocus: true,
  })

  return {
    videos: query.data || [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: query.refetch,
    isSuccess: query.isSuccess,
  }
}

// ============================================================================
// useVideo Hook
// ============================================================================

export interface UseVideoReturn {
  /** The video if found, undefined otherwise */
  video: Video | undefined
  /** Whether the video list is loading */
  isLoading: boolean
  /** Whether the video was found in the list */
  isFound: boolean
}

/**
 * Hook for getting a single video by ID.
 * 
 * Uses the videos list from useVideos and finds the matching video.
 * For direct entity fetching by key, use fetchVideoById from videoService.
 * 
 * @param videoId - The video entity key
 * @returns Single video data and loading state
 * 
 * @example
 * ```tsx
 * function VideoPlayer({ videoId }: { videoId: string }) {
 *   const { video, isLoading, isFound } = useVideo(videoId)
 *   
 *   if (isLoading) return <LoadingSpinner />
 *   if (!isFound) return <NotFound />
 *   
 *   return <Player src={video.filecoinCid} />
 * }
 * ```
 */
export function useVideo(videoId: string): UseVideoReturn {
  const { videos, isLoading } = useVideos()

  const video = videos.find(v => v.id === videoId)

  return {
    video,
    isLoading,
    isFound: !!video,
  }
}

// ============================================================================
// useVideoQuery Hook (for direct fetching by ID)
// ============================================================================

export interface UseVideoQueryReturn {
  /** The video if found, null if not found, undefined while loading */
  video: Video | null | undefined
  /** Whether initial fetch is in progress */
  isLoading: boolean
  /** Whether background refetch is in progress */
  isFetching: boolean
  /** Whether the fetch resulted in an error */
  isError: boolean
  /** Error object if fetch failed */
  error: Error | null
  /** Manually refetch the video */
  refetch: () => Promise<UseQueryResult<Video | null, Error>>
}

/**
 * Hook for directly fetching a single video by ID.
 * 
 * Unlike useVideo which searches the cache, this hook fetches directly
 * from Arkiv. Use when you need to ensure fresh data for a specific video.
 * 
 * @param videoId - The video entity key
 * @param enabled - Whether to enable the query (default: true)
 * @returns Single video data and loading state
 * 
 * @example
 * ```tsx
 * function VideoDetail({ videoId }: { videoId: string }) {
 *   const { video, isLoading, isError } = useVideoQuery(videoId)
 *   
 *   if (isLoading) return <LoadingSpinner />
 *   if (isError || !video) return <ErrorMessage />
 *   
 *   return <VideoPlayer video={video} />
 * }
 * ```
 */
export function useVideoQuery(
  videoId: string, 
  enabled: boolean = true
): UseVideoQueryReturn {
  const query = useQuery({
    queryKey: videoKeys.detail(videoId),
    queryFn: () => fetchVideoById(videoId),
    enabled: enabled && !!videoId,
    staleTime: 5 * 60 * 1000,
  })

  return {
    video: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: query.refetch,
  }
}

// ============================================================================
// useInvalidateVideos Hook
// ============================================================================

export interface UseInvalidateVideosReturn {
  /** Invalidate all video queries for the current wallet */
  invalidate: () => Promise<void>
  /** Invalidate a specific video query */
  invalidateVideo: (videoId: string) => Promise<void>
  /** Refetch all videos immediately */
  refetch: () => Promise<void>
}

/**
 * Hook for invalidating video queries.
 * 
 * Useful after mutations (upload, delete, update) to trigger refetching.
 * 
 * @returns Functions to invalidate video queries
 * 
 * @example
 * ```tsx
 * function VideoUploader() {
 *   const { invalidate } = useInvalidateVideos()
 *   
 *   const handleUpload = async (file: File) => {
 *     await uploadVideo(file)
 *     await invalidate() // Refresh the video list
 *   }
 * }
 * ```
 */
export function useInvalidateVideos(): UseInvalidateVideosReturn {
  const queryClient = useQueryClient()
  const { address } = useAppKitAccount()

  const invalidate = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: videoKeys.list(address),
    })
  }, [queryClient, address])

  const invalidateVideo = useCallback(async (videoId: string) => {
    await queryClient.invalidateQueries({
      queryKey: videoKeys.detail(videoId),
    })
  }, [queryClient])

  const refetch = useCallback(async () => {
    await queryClient.refetchQueries({
      queryKey: videoKeys.list(address),
    })
  }, [queryClient, address])

  return {
    invalidate,
    invalidateVideo,
    refetch,
  }
}

// ============================================================================
// usePrefetchVideos Hook
// ============================================================================

/**
 * Hook for prefetching videos (useful for optimistic UI).
 * 
 * @returns Function to prefetch videos
 * 
 * @example
 * ```tsx
 * function VideoListItem({ video }: { video: Video }) {
 *   const { prefetch } = usePrefetchVideos()
 *   
 *   return (
 *     <div 
 *       onMouseEnter={() => prefetch()}
 *       onClick={() => router.push(`/watch?v=${video.id}`)}
 *     >
 *       {video.title}
 *     </div>
 *   )
 * }
 * ```
 */
export function usePrefetchVideos() {
  const queryClient = useQueryClient()
  const { address } = useAppKitAccount()

  const prefetch = useCallback(() => {
    if (!address) return

    // Prefetch the videos list
    queryClient.prefetchQuery({
      queryKey: videoKeys.list(address),
      queryFn: () => fetchAllVideos(address),
      staleTime: 5 * 60 * 1000,
    })
  }, [queryClient, address])

  const prefetchVideo = useCallback((videoId: string) => {
    queryClient.prefetchQuery({
      queryKey: videoKeys.detail(videoId),
      queryFn: () => fetchVideoById(videoId),
      staleTime: 5 * 60 * 1000,
    })
  }, [queryClient])

  return {
    prefetch,
    prefetchVideo,
  }
}

// ============================================================================
// useVideosWithOptions Hook (for pagination)
// ============================================================================

export interface UseVideosWithOptionsReturn extends UseVideosReturn {
  /** Whether there are more videos to fetch */
  hasMore: boolean
  /** Fetch the next page of videos */
  fetchNextPage: () => Promise<void>
  /** Whether fetching next page */
  isFetchingNextPage: boolean
}

/**
 * Hook for fetching videos with pagination support.
 * 
 * Note: This is a placeholder for when Arkiv supports cursor-based pagination
 * in the React Query hooks. Currently uses the same implementation as useVideos.
 * 
 * @param maxResults - Maximum results per page
 * @returns Videos with pagination controls
 * 
 * @example
 * ```tsx
 * function PaginatedVideoList() {
 *   const { videos, hasMore, fetchNextPage, isFetchingNextPage } = 
 *     useVideosWithOptions(50)
 *   
 *   return (
 *     <>
 *       <VideoGrid videos={videos} />
 *       {hasMore && (
 *         <Button onClick={fetchNextPage} disabled={isFetchingNextPage}>
 *           {isFetchingNextPage ? 'Loading...' : 'Load More'}
 *         </Button>
 *       )}
 *     </>
 *   )
 * }
 * ```
 */
export function useVideosWithOptions(
  maxResults: number = 50
): UseVideosWithOptionsReturn {
  const { address, isConnected } = useAppKitAccount()

  const query = useQuery({
    queryKey: [...videoKeys.list(address), { maxResults }],
    queryFn: async () => {
      if (!address) {
        throw new Error('Wallet not connected')
      }
      return fetchVideos({ ownerAddress: address, maxResults })
    },
    enabled: isConnected && !!address,
    staleTime: 5 * 60 * 1000,
  })

  // Placeholder for pagination - full implementation would use useInfiniteQuery
  const fetchNextPage = useCallback(async () => {
    await query.refetch()
  }, [query])

  return {
    videos: query.data || [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: query.refetch,
    isSuccess: query.isSuccess,
    hasMore: false, // TODO: Implement cursor-based pagination
    fetchNextPage,
    isFetchingNextPage: query.isFetching,
  }
}

// Re-export error helper
export { getVideoErrorMessage }
