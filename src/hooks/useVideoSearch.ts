'use client'

/**
 * Video Search Hook
 * 
 * Provides client-side filtering, searching, and sorting of videos.
 * Uses the cached videos from useVideos for efficient performance.
 * 
 * @module hooks/useVideoSearch
 */

import { useMemo, useCallback, useState } from 'react'
import { useVideos } from './useVideos'
import type { Video, VideoFilters } from '@/types'

// ============================================================================
// Types
// ============================================================================

/**
 * Sortable fields for videos.
 */
export type VideoSortField = 'date' | 'title' | 'duration' | 'createdAt'

/**
 * Sort order direction.
 */
export type SortOrder = 'asc' | 'desc'

/**
 * Options for video search and filtering.
 */
export interface UseVideoSearchOptions {
  /** Search query string (searches title and creator) */
  query?: string
  /** Filters to apply */
  filters?: VideoFilters
  /** Field to sort by */
  sortBy?: VideoSortField
  /** Sort direction */
  sortOrder?: SortOrder
}

/**
 * Return type for useVideoSearch hook.
 */
export interface UseVideoSearchReturn {
  /** Filtered and sorted videos */
  videos: Video[]
  /** Total number of videos (before filtering) */
  totalCount: number
  /** Number of videos after filtering */
  filteredCount: number
  /** Whether videos are loading */
  isLoading: boolean
  /** Whether an error occurred */
  isError: boolean
  /** Error object if any */
  error: Error | null
  /** Update the search query */
  setQuery: (query: string) => void
  /** Update filters */
  setFilters: (filters: VideoFilters) => void
  /** Update sort field */
  setSortBy: (sortBy: VideoSortField) => void
  /** Update sort order */
  setSortOrder: (sortOrder: SortOrder) => void
  /** Reset all search options to defaults */
  reset: () => void
  /** Current search options */
  options: Required<UseVideoSearchOptions>
}

// ============================================================================
// Default Options
// ============================================================================

const defaultOptions: Required<UseVideoSearchOptions> = {
  query: '',
  filters: {},
  sortBy: 'date',
  sortOrder: 'desc',
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Filter videos by text query (searches title and creatorHandle).
 */
function filterByQuery(videos: Video[], query: string): Video[] {
  if (!query.trim()) return videos

  const searchTerm = query.toLowerCase().trim()
  
  return videos.filter(video => {
    const titleMatch = video.title.toLowerCase().includes(searchTerm)
    const creatorMatch = video.creatorHandle?.toLowerCase().includes(searchTerm)
    return titleMatch || creatorMatch
  })
}

/**
 * Filter videos by encrypted status.
 */
function filterByEncrypted(videos: Video[], encrypted: boolean): Video[] {
  return videos.filter(v => v.isEncrypted === encrypted)
}

/**
 * Filter videos by AI data availability.
 */
function filterByAiData(videos: Video[], hasAiData: boolean): Video[] {
  return videos.filter(v => v.hasAiData === hasAiData)
}

/**
 * Filter videos by date range.
 */
function filterByDateRange(
  videos: Video[], 
  dateRange: { start: Date; end: Date }
): Video[] {
  return videos.filter(v => {
    const videoDate = v.createdAt
    return videoDate >= dateRange.start && videoDate <= dateRange.end
  })
}

/**
 * Filter videos by duration range (in seconds).
 */
function filterByDurationRange(
  videos: Video[], 
  durationRange: { min: number; max: number }
): Video[] {
  return videos.filter(v => 
    v.duration >= durationRange.min && v.duration <= durationRange.max
  )
}

/**
 * Filter videos by creator handle.
 */
function filterByCreator(videos: Video[], creatorHandle: string): Video[] {
  const handle = creatorHandle.toLowerCase()
  return videos.filter(v => 
    v.creatorHandle?.toLowerCase() === handle
  )
}

/**
 * Sort videos by the specified field and order.
 */
function sortVideos(
  videos: Video[], 
  sortBy: VideoSortField, 
  sortOrder: SortOrder
): Video[] {
  const sorted = [...videos]

  sorted.sort((a, b) => {
    let comparison = 0

    switch (sortBy) {
      case 'date':
      case 'createdAt':
        comparison = a.createdAt.getTime() - b.createdAt.getTime()
        break
      case 'title':
        comparison = a.title.localeCompare(b.title)
        break
      case 'duration':
        comparison = a.duration - b.duration
        break
    }

    return sortOrder === 'asc' ? comparison : -comparison
  })

  return sorted
}

/**
 * Apply all filters to videos.
 */
function applyFilters(videos: Video[], filters: VideoFilters): Video[] {
  let result = videos

  if (filters.encrypted !== undefined) {
    result = filterByEncrypted(result, filters.encrypted)
  }

  if (filters.hasAiData !== undefined) {
    result = filterByAiData(result, filters.hasAiData)
  }

  if (filters.dateRange) {
    result = filterByDateRange(result, filters.dateRange)
  }

  if (filters.durationRange) {
    result = filterByDurationRange(result, filters.durationRange)
  }

  if (filters.creatorHandle) {
    result = filterByCreator(result, filters.creatorHandle)
  }

  return result
}

// ============================================================================
// Main Hook
// ============================================================================

/**
 * Hook for searching, filtering, and sorting videos.
 * 
 * Provides client-side filtering of the cached video list with:
 * - Text search (title, creator)
 * - Filters (encrypted, AI data, date range, duration range)
 * - Sorting (date, title, duration)
 * 
 * All operations are performed on cached data for instant results.
 * 
 * @param initialOptions - Initial search options
 * @returns Filtered videos and control functions
 * 
 * @example
 * ```tsx
 * function VideoLibrary() {
 *   const { 
 *     videos, 
 *     totalCount, 
 *     filteredCount,
 *     setQuery,
 *     setFilters,
 *     isLoading 
 *   } = useVideoSearch({
 *     sortBy: 'date',
 *     sortOrder: 'desc',
 *   })
 *   
 *   return (
 *     <div>
 *       <SearchInput onChange={setQuery} />
 *       <FilterButtons onFilter={setFilters} />
 *       <div>{filteredCount} of {totalCount} videos</div>
 *       <VideoGrid videos={videos} isLoading={isLoading} />
 *     </div>
 *   )
 * }
 * ```
 */
export function useVideoSearch(
  initialOptions: UseVideoSearchOptions = {}
): UseVideoSearchReturn {
  // Merge with defaults
  const [options, setOptions] = useState<Required<UseVideoSearchOptions>>({
    ...defaultOptions,
    ...initialOptions,
  })

  // Get videos from cache
  const { videos, isLoading, isError, error } = useVideos()

  // Apply filters and sorting
  const filteredVideos = useMemo(() => {
    let result = [...videos]

    // Text search
    if (options.query) {
      result = filterByQuery(result, options.query)
    }

    // Apply filters
    result = applyFilters(result, options.filters)

    // Sort
    result = sortVideos(result, options.sortBy, options.sortOrder)

    return result
  }, [videos, options])

  // Control functions
  const setQuery = useCallback((query: string) => {
    setOptions(prev => ({ ...prev, query }))
  }, [])

  const setFilters = useCallback((filters: VideoFilters) => {
    setOptions(prev => ({ ...prev, filters }))
  }, [])

  const setSortBy = useCallback((sortBy: VideoSortField) => {
    setOptions(prev => ({ ...prev, sortBy }))
  }, [])

  const setSortOrder = useCallback((sortOrder: SortOrder) => {
    setOptions(prev => ({ ...prev, sortOrder }))
  }, [])

  const reset = useCallback(() => {
    setOptions(defaultOptions)
  }, [])

  return {
    videos: filteredVideos,
    totalCount: videos.length,
    filteredCount: filteredVideos.length,
    isLoading,
    isError,
    error,
    setQuery,
    setFilters,
    setSortBy,
    setSortOrder,
    reset,
    options,
  }
}

// ============================================================================
// Additional Hooks
// ============================================================================

/**
 * Hook for simple text search only.
 * 
 * @param initialQuery - Initial search query
 * @returns Videos matching the query
 * 
 * @example
 * ```tsx
 * function SearchResults({ query }: { query: string }) {
 *   const { videos, isLoading } = useVideoTextSearch(query)
 *   return <VideoGrid videos={videos} isLoading={isLoading} />
 * }
 * ```
 */
export function useVideoTextSearch(query: string = '') {
  const { videos, isLoading, isError, error } = useVideos()

  const filteredVideos = useMemo(() => {
    if (!query.trim()) return videos
    return filterByQuery(videos, query)
  }, [videos, query])

  return {
    videos: filteredVideos,
    count: filteredVideos.length,
    totalCount: videos.length,
    isLoading,
    isError,
    error,
  }
}

/**
 * Hook for filtering videos by a single property.
 * 
 * @param filterFn - Function to filter videos
 * @returns Filtered videos
 * 
 * @example
 * ```tsx
 * function EncryptedVideos() {
 *   const { videos } = useVideoFilter(v => v.isEncrypted)
 *   return <VideoGrid videos={videos} />
 * }
 * ```
 */
export function useVideoFilter(
  filterFn: (video: Video) => boolean
) {
  const { videos, isLoading, isError, error } = useVideos()

  const filteredVideos = useMemo(() => {
    return videos.filter(filterFn)
  }, [videos, filterFn])

  return {
    videos: filteredVideos,
    count: filteredVideos.length,
    totalCount: videos.length,
    isLoading,
    isError,
    error,
  }
}

/**
 * Hook for sorting videos.
 * 
 * @param sortBy - Field to sort by
 * @param sortOrder - Sort direction
 * @returns Sorted videos
 * 
 * @example
 * ```tsx
 * function SortedVideos() {
 *   const { videos, setSortBy, setSortOrder } = useVideoSort('date', 'desc')
 *   return <VideoGrid videos={videos} />
 * }
 * ```
 */
export function useVideoSort(
  initialSortBy: VideoSortField = 'date',
  initialSortOrder: SortOrder = 'desc'
) {
  const [sortBy, setSortBy] = useState<VideoSortField>(initialSortBy)
  const [sortOrder, setSortOrder] = useState<SortOrder>(initialSortOrder)

  const { videos, isLoading, isError, error } = useVideos()

  const sortedVideos = useMemo(() => {
    return sortVideos(videos, sortBy, sortOrder)
  }, [videos, sortBy, sortOrder])

  const toggleSortOrder = useCallback(() => {
    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
  }, [])

  return {
    videos: sortedVideos,
    sortBy,
    sortOrder,
    setSortBy,
    setSortOrder,
    toggleSortOrder,
    isLoading,
    isError,
    error,
  }
}
