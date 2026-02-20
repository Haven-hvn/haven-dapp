"use client";

/**
 * Video Grid Component
 * 
 * Main video library component with grid/list view, search, filters,
 * loading states, and cache status indicators. Uses lazy loading for 
 * video cards to optimize initial page load performance.
 * 
 * @module components/library/VideoGrid
 */

import { useState, Suspense, lazy, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useVideoSearch } from "@/hooks/useVideoSearch";
import { useCacheStatus } from "@/hooks/useCacheStatus";
import { VideoListItem } from "./VideoListItem";
import { SearchBar } from "./SearchBar";
import { FilterControls } from "./FilterControls";
import { ViewToggle } from "./ViewToggle";
import { Skeleton } from "@/components/ui/skeleton";
import type { ViewMode, VideoFilters } from "@/types";
import type { VideoSortField, SortOrder } from "@/hooks/useVideoSearch";
import { Cloud } from "lucide-react";

// Lazy load VideoCard for better initial load performance
const VideoCard = lazy(() =>
  import("./VideoCard").then((mod) => ({ default: mod.VideoCard }))
);

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Video card skeleton for loading state.
 */
function VideoCardSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="aspect-video rounded-lg" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}

/**
 * Main video grid component with search, filters, view toggle, and cache status.
 * 
 * Features:
 * - Responsive grid and list layouts
 * - Debounced search
 * - Filter by encrypted status and AI data
 * - View mode toggle (grid/list)
 * - Loading skeletons
 * - Empty state
 * - Lazy loaded video cards for performance
 * - Cache status badges for encrypted videos
 * - Cache stats in header
 */
export function VideoGrid() {
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<VideoFilters>({});
  const [sortBy] = useState<VideoSortField>("date");
  const [sortOrder] = useState<SortOrder>("desc");

  const router = useRouter();

  const handleVideoClick = useCallback(
    (video: { id: string }) => {
      router.push(`/watch?v=${encodeURIComponent(video.id)}`);
    },
    [router]
  );

  const {
    videos,
    totalCount,
    filteredCount,
    isLoading,
    isError,
    error,
  } = useVideoSearch({
    query: searchQuery,
    filters,
    sortBy,
    sortOrder,
  });

  // Get encrypted video IDs for cache status check
  const encryptedVideoIds = useMemo(() => {
    return videos.filter((v) => v.isEncrypted).map((v) => v.id);
  }, [videos]);

  // Check cache status for encrypted videos
  const { cacheStatus, cachedCount, totalCacheSize, isLoading: isCacheLoading } = useCacheStatus(encryptedVideoIds);

  // Handle loading state
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex-1 w-full sm:w-auto">
            <div className="h-9 bg-muted rounded-md animate-pulse" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 bg-muted rounded-md animate-pulse" />
            <div className="h-9 w-20 bg-muted rounded-md animate-pulse" />
          </div>
        </div>
        <VideoGridSkeleton viewMode={viewMode} />
      </div>
    );
  }

  // Handle error state
  if (isError) {
    return (
      <div className="text-center py-20">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-destructive/10 flex items-center justify-center">
          <ErrorIcon className="w-8 h-8 text-destructive" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Failed to load videos</h3>
        <p className="text-muted-foreground max-w-sm mx-auto">
          {error?.message ||
            "An error occurred while loading your videos. Please try again."}
        </p>
      </div>
    );
  }

  // Handle empty state (no videos at all)
  if (totalCount === 0) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-stretch sm:items-center justify-between">
        <div className="flex-1 w-full sm:w-auto">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search videos..."
          />
        </div>
        <div className="flex items-center gap-2 justify-end">
          <FilterControls filters={filters} onChange={setFilters} />
          <ViewToggle mode={viewMode} onChange={setViewMode} />
        </div>
      </div>

      {/* Results count and cache stats */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        <div className="text-sm text-muted-foreground">
          {filteredCount === totalCount ? (
            `${totalCount} video${totalCount !== 1 ? "s" : ""}`
          ) : (
            `${filteredCount} of ${totalCount} videos`
          )}
        </div>
        
        {/* Cache stats - show when videos are cached */}
        {!isCacheLoading && cachedCount > 0 && (
          <div className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1.5">
            <Cloud className="w-3.5 h-3.5" />
            <span>
              {cachedCount} video{cachedCount !== 1 ? "s" : ""} cached for instant playback
              {totalCacheSize > 0 && ` • ${formatBytes(totalCacheSize)}`}
            </span>
          </div>
        )}
      </div>

      {/* Grid/List */}
      {viewMode === "grid" ? (
        <Suspense
          fallback={
            <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <VideoCardSkeleton key={i} />
              ))}
            </div>
          }
        >
          <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
            {videos.map((video) => (
              <VideoCard 
                key={video.id} 
                video={video} 
                onClick={handleVideoClick}
                isCached={cacheStatus.get(video.id) ?? false}
              />
            ))}
          </div>
        </Suspense>
      ) : (
        <div className="space-y-2">
          {videos.map((video) => (
            <VideoListItem 
              key={video.id} 
              video={video} 
              isCached={cacheStatus.get(video.id) ?? false}
            />
          ))}
        </div>
      )}

      {/* Empty search results */}
      {filteredCount === 0 && totalCount > 0 && (
        <div className="text-center py-12">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-muted flex items-center justify-center">
            <SearchIcon className="w-6 h-6 text-muted-foreground" />
          </div>
          <h3 className="text-base font-medium mb-1">
            No videos match your search
          </h3>
          <p className="text-sm text-muted-foreground">
            Try adjusting your filters or search query
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Skeleton loader for video grid.
 */
function VideoGridSkeleton({ viewMode }: { viewMode: ViewMode }) {
  if (viewMode === "grid") {
    return (
      <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="aspect-video rounded-lg" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-4 p-4 border rounded-lg">
          <Skeleton className="w-40 h-24 rounded flex-shrink-0" />
          <div className="flex-1 space-y-2 py-2">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-4 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Empty state when no videos exist.
 */
function EmptyState() {
  return (
    <div className="text-center py-20">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
        <VideoIcon className="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2">No videos yet</h3>
      <p className="text-muted-foreground max-w-sm mx-auto">
        Videos you upload from the Haven desktop app will appear here. Make sure
        Arkiv sync is enabled in your desktop app settings.
      </p>
    </div>
  );
}

/**
 * Video icon for empty state.
 */
function VideoIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
    >
      <path d="m22 8-6 4 6 4V8Z" />
      <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
    </svg>
  );
}

/**
 * Search icon for empty search results.
 */
function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

/**
 * Error icon for error state.
 */
function ErrorIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" x2="12" y1="8" y2="12" />
      <line x1="12" x2="12.01" y1="16" y2="16" />
    </svg>
  );
}
