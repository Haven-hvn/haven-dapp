# Task 2.2 — Update React Query Hooks for Cache-Aware Fetching

**Sprint:** 2 — Core Integration  
**Estimate:** 3–4 hours  
**Files:** `src/hooks/useVideos.ts` (modify), `src/hooks/useCachedVideos.ts` (new)

## Objective

Update the existing React Query hooks to leverage the cache-integrated video service. Add a new `useCachedVideos` hook that provides cache-specific state (e.g., which videos are from cache vs. Arkiv, cache freshness). Ensure the UI gets instant data from cache while Arkiv fetches happen in the background.

## Background

Currently, `useVideos` fetches from Arkiv via React Query with a 5-minute stale time. On page load, users see a loading spinner until Arkiv responds. With the cache layer, we can show cached data immediately (stale-while-revalidate pattern) and update in the background.

## Prerequisites

- Task 2.1 (cache-integrated video service)

## Requirements

### 1. Modify `useVideos` — Add `initialData` from Cache

Update the React Query configuration to use cached data as `initialData` so the UI renders immediately:

```typescript
export function useVideos(): UseVideosReturn {
  const { address, isConnected } = useAppKitAccount()
  const [initialData, setInitialData] = useState<Video[] | undefined>(undefined)

  // Load cached data on mount (before React Query fires)
  useEffect(() => {
    if (address) {
      const cacheService = getVideoCacheService(address)
      cacheService.getVideos().then(cached => {
        if (cached.length > 0) {
          setInitialData(cached)
        }
      }).catch(() => {
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
    staleTime: 5 * 60 * 1000,
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
```

**Key change:** `isLoading` is `false` when we have cached data, even if Arkiv fetch is still in progress. This eliminates the loading spinner for returning users.

### 2. Modify `useVideoQuery` — Cache Fallback for Single Video

```typescript
export function useVideoQuery(
  videoId: string, 
  enabled: boolean = true
): UseVideoQueryReturn {
  const { address } = useAppKitAccount()

  const query = useQuery({
    queryKey: videoKeys.detail(videoId),
    queryFn: async () => {
      // Use cache-aware fetch when we have the owner address
      if (address) {
        return fetchVideoByIdWithCache(videoId, address)
      }
      return fetchVideoById(videoId)
    },
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
```

### 3. New Hook: `useCachedVideos`

Provides cache-specific metadata alongside the video list:

```typescript
// src/hooks/useCachedVideos.ts

export interface UseCachedVideosReturn {
  /** All videos (Arkiv + cached expired) */
  videos: Video[]
  /** Videos currently active on Arkiv */
  activeVideos: Video[]
  /** Videos only available from cache (expired on Arkiv) */
  expiredVideos: Video[]
  /** Whether initial data is from cache */
  isFromCache: boolean
  /** Whether Arkiv fetch is in progress */
  isSyncing: boolean
  /** Cache statistics */
  cacheStats: CacheStats | null
  /** Last successful sync timestamp */
  lastSyncedAt: number | null
  /** Loading state */
  isLoading: boolean
  /** Error state */
  error: Error | null
  /** Force a full re-sync with Arkiv */
  forceSync: () => Promise<void>
}

export function useCachedVideos(): UseCachedVideosReturn {
  const { address, isConnected } = useAppKitAccount()
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null)
  
  const { videos, isLoading, isFetching, error, refetch } = useVideos()

  // Load cache stats
  useEffect(() => {
    if (address) {
      const cacheService = getVideoCacheService(address)
      cacheService.getStats().then(setCacheStats).catch(() => {})
      cacheService.getLastSyncTime().then(setLastSyncedAt).catch(() => {})
    }
  }, [address, videos]) // Re-fetch stats when videos change

  // Separate active vs expired
  const activeVideos = useMemo(() => 
    videos.filter(v => /* determine if active — needs cache metadata */),
    [videos]
  )
  
  const expiredVideos = useMemo(() =>
    videos.filter(v => /* determine if expired — needs cache metadata */),
    [videos]
  )

  const forceSync = useCallback(async () => {
    await refetch()
  }, [refetch])

  return {
    videos,
    activeVideos,
    expiredVideos,
    isFromCache: !isFetching && videos.length > 0,
    isSyncing: isFetching,
    cacheStats,
    lastSyncedAt,
    isLoading,
    error: error as Error | null,
    forceSync,
  }
}
```

### 4. Add `arkivEntityStatus` to Video Type (Optional Extension)

To distinguish active vs. expired videos in the UI without querying the cache separately, consider adding an optional field to `Video`:

```typescript
// In src/types/video.ts, add to Video interface:
/** Whether this video's Arkiv entity is still active (from cache metadata) */
arkivStatus?: 'active' | 'expired' | 'unknown'
```

This field is populated by `cachedVideoToVideo` when reading from cache and set to `'active'` for fresh Arkiv results.

### 5. Update `useInvalidateVideos`

Ensure cache is also invalidated when React Query cache is invalidated:

```typescript
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

  // ... rest unchanged
}
```

## Stale-While-Revalidate Flow

```
1. User opens library page
2. useVideos fires
3. useEffect loads cached data from IndexedDB → sets as initialData
4. UI renders immediately with cached data (no loading spinner)
5. React Query fires fetchAllVideos() in background
6. fetchAllVideos() calls Arkiv SDK
7. On success: syncs to cache, returns merged list
8. React Query updates → UI re-renders with fresh data
9. User sees no loading state (seamless update)
```

## Acceptance Criteria

- [ ] Returning users see cached data immediately (no loading spinner)
- [ ] New users still see loading spinner (no cache yet)
- [ ] `useVideos` returns cached data while Arkiv fetch is in progress
- [ ] `useVideoQuery` falls back to cache for expired entities
- [ ] `useCachedVideos` provides active/expired video separation
- [ ] `useCachedVideos` provides cache statistics
- [ ] React Query invalidation triggers Arkiv re-fetch (not cache clear)
- [ ] `isLoading` is `false` when cached data is available
- [ ] `isFetching` correctly indicates background Arkiv fetch
- [ ] All hooks are exported from `src/hooks/index.ts`

## Testing Notes

- Test with empty cache (first-time user) — should show loading then data
- Test with populated cache — should show data immediately, then update
- Test with Arkiv down + populated cache — should show cached data with no error
- Test cache stats update after sync