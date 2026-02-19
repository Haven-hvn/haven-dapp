# Task 5.1: Cache Management Settings Page

## Objective

Create a settings page/section where users can view cache statistics, manage cached videos, configure cache behavior, and clear cached data. This gives users full control over their local storage usage.

## Requirements

### Settings Component (`src/components/settings/CacheManagement.tsx`)

#### Storage Overview Section

- **Total cache usage**: "2.3 GB of 10 GB used" with visual progress bar
- **Number of cached videos**: "12 videos cached"
- **Storage quota**: Show browser-reported quota
- **Estimated savings**: "Saved ~45 minutes of decryption time"

#### Cached Videos List

- List all cached videos with:
  - Video title and thumbnail
  - File size
  - When it was cached
  - When it expires
  - "Remove" button per video
- Sort by: size (largest first), date cached, expiration date
- Select multiple for bulk removal

#### Configuration Options

- **Cache TTL**: Slider/dropdown for retention period (1 hour → 30 days)
- **Max cache size**: Slider for maximum storage usage (500MB → 10GB)
- **Max cached videos**: Number input (5 → 100)
- **Prefetch enabled**: Toggle for background prefetching
- **Clear videos on disconnect**: Toggle for security-conscious users

#### Actions

- **Clear All Cache**: Button to remove all cached videos
- **Clear Expired**: Button to remove only expired entries
- **Export Cache Info**: Download a JSON summary of cached videos (for debugging)

### Settings Store (`src/stores/cacheSettingsStore.ts`)

Zustand store for persisting cache settings:

```typescript
interface CacheSettings {
  ttlDays: number           // Default: 7
  maxCacheSizeMB: number    // Default: 5000 (5GB)
  maxCachedVideos: number   // Default: 50
  prefetchEnabled: boolean  // Default: true
  clearOnDisconnect: boolean // Default: false
}
```

## Implementation Details

### Settings Component

```typescript
// src/components/settings/CacheManagement.tsx
'use client'

import { useState, useEffect } from 'react'
import { useCacheStatus } from '@/hooks/useCacheStatus'
import { listCachedVideos, deleteVideo, clearAllVideos, getCacheStorageEstimate } from '@/lib/video-cache'
import { formatBytes } from '@/lib/crypto'
import { useCacheSettings } from '@/stores/cacheSettingsStore'
import { Trash2, HardDrive, Clock, Settings, RefreshCw } from 'lucide-react'

export function CacheManagement() {
  const [entries, setEntries] = useState<CacheEntry[]>([])
  const [storageEstimate, setStorageEstimate] = useState({ usage: 0, quota: 0, percent: 0 })
  const [isLoading, setIsLoading] = useState(true)
  const settings = useCacheSettings()
  
  const loadData = async () => {
    setIsLoading(true)
    try {
      const [cachedVideos, estimate] = await Promise.all([
        listCachedVideos(),
        getCacheStorageEstimate(),
      ])
      setEntries(cachedVideos)
      setStorageEstimate(estimate)
    } finally {
      setIsLoading(false)
    }
  }
  
  useEffect(() => { loadData() }, [])
  
  const handleRemove = async (videoId: string) => {
    await deleteVideo(videoId)
    loadData()
  }
  
  const handleClearAll = async () => {
    if (confirm('Remove all cached videos? You will need to re-decrypt them on next play.')) {
      await clearAllVideos()
      loadData()
    }
  }
  
  return (
    <div className="space-y-8">
      {/* Storage Overview */}
      <section>
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <HardDrive className="w-5 h-5" />
          Storage Usage
        </h2>
        <div className="mt-4 p-4 bg-white/5 rounded-lg">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-white/60">
              {formatBytes(storageEstimate.usage)} used
            </span>
            <span className="text-white/40">
              {formatBytes(storageEstimate.quota)} available
            </span>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div 
              className="h-full bg-purple-500 rounded-full transition-all"
              style={{ width: `${Math.min(100, storageEstimate.percent)}%` }}
            />
          </div>
          <p className="text-xs text-white/40 mt-2">
            {entries.length} video{entries.length !== 1 ? 's' : ''} cached
          </p>
        </div>
      </section>
      
      {/* Cached Videos List */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Cached Videos</h2>
          <div className="flex gap-2">
            <button onClick={loadData} className="...">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
            <button onClick={handleClearAll} className="... text-red-400">
              <Trash2 className="w-4 h-4" /> Clear All
            </button>
          </div>
        </div>
        
        <div className="mt-4 space-y-2">
          {entries.map(entry => (
            <CachedVideoRow 
              key={entry.videoId}
              entry={entry}
              onRemove={() => handleRemove(entry.videoId)}
            />
          ))}
          {entries.length === 0 && (
            <p className="text-white/40 text-center py-8">
              No videos cached yet. Videos will be cached automatically after first play.
            </p>
          )}
        </div>
      </section>
      
      {/* Settings */}
      <section>
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Cache Settings
        </h2>
        <div className="mt-4 space-y-4">
          <SettingRow
            label="Cache retention"
            description="How long to keep cached videos"
          >
            <select 
              value={settings.ttlDays}
              onChange={(e) => settings.setTtlDays(Number(e.target.value))}
              className="..."
            >
              <option value={1}>1 day</option>
              <option value={3}>3 days</option>
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
            </select>
          </SettingRow>
          
          <SettingRow
            label="Background prefetch"
            description="Automatically cache videos you're likely to watch"
          >
            <Toggle 
              checked={settings.prefetchEnabled}
              onChange={settings.setPrefetchEnabled}
            />
          </SettingRow>
          
          <SettingRow
            label="Clear on disconnect"
            description="Remove cached videos when you disconnect your wallet"
          >
            <Toggle 
              checked={settings.clearOnDisconnect}
              onChange={settings.setClearOnDisconnect}
            />
          </SettingRow>
        </div>
      </section>
    </div>
  )
}
```

### Zustand Settings Store

```typescript
// src/stores/cacheSettingsStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface CacheSettingsState {
  ttlDays: number
  maxCacheSizeMB: number
  maxCachedVideos: number
  prefetchEnabled: boolean
  clearOnDisconnect: boolean
  
  setTtlDays: (days: number) => void
  setMaxCacheSizeMB: (mb: number) => void
  setMaxCachedVideos: (count: number) => void
  setPrefetchEnabled: (enabled: boolean) => void
  setClearOnDisconnect: (clear: boolean) => void
  resetToDefaults: () => void
}

const DEFAULTS = {
  ttlDays: 7,
  maxCacheSizeMB: 5000,
  maxCachedVideos: 50,
  prefetchEnabled: true,
  clearOnDisconnect: false,
}

export const useCacheSettings = create<CacheSettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      
      setTtlDays: (days) => set({ ttlDays: days }),
      setMaxCacheSizeMB: (mb) => set({ maxCacheSizeMB: mb }),
      setMaxCachedVideos: (count) => set({ maxCachedVideos: count }),
      setPrefetchEnabled: (enabled) => set({ prefetchEnabled: enabled }),
      setClearOnDisconnect: (clear) => set({ clearOnDisconnect: clear }),
      resetToDefaults: () => set(DEFAULTS),
    }),
    {
      name: 'haven-cache-settings',
    }
  )
)
```

## Arkiv Cache Integration

> **Cross-reference:** [Arkiv Cache](../../arkiv-cache/) — IndexedDB metadata persistence for video entities.

### Extending the Existing CacheManagement Component

The [arkiv-cache sprint 4](../../arkiv-cache/sprint-4/02-cache-management-settings.md) already created a `CacheManagement.tsx` component with a section-based layout that includes a placeholder for video content cache. **This task extends that existing component** rather than creating a new one.

The arkiv-cache component has:
- Section 1: **Video Metadata** (stats, sync controls, preferences) — already implemented
- Section 2: **Video Content** — placeholder saying "Video content caching is not yet available."

This task replaces the placeholder with the full video content cache management UI described above.

### Extending the `useCacheStatus` Hook

The arkiv-cache created a `useCacheStatus` hook that returns `metadataStats` and `contentStats: null`. This task fills in the `contentStats`:

```typescript
// Extend the existing useCacheStatus hook
interface ContentCacheStats {
  cachedVideoCount: number
  totalContentSize: number    // bytes
  storageUsage: number        // bytes (from navigator.storage.estimate)
  storageQuota: number        // bytes
  storagePercent: number      // 0-100
}

// The hook now returns real content stats instead of null
const { metadataStats, contentStats, totalCacheSize } = useCacheStatus()
```

### Cached Videos List — Cross-Reference with Metadata

The cached videos list should display video **titles and descriptions** alongside cache size info. This metadata comes from the arkiv-cache:

```typescript
// Get cache entries (from Cache API) and metadata (from arkiv-cache)
const cacheEntries = await listCachedVideos()  // Cache API entries with videoId + size
const cacheService = getVideoCacheService(walletAddress)
const metadataVideos = await cacheService.getContentCachedVideos()  // Videos with videoCacheStatus === 'cached'

// Merge: cache entry size + metadata title/description
const enrichedEntries = cacheEntries.map(entry => {
  const metadata = metadataVideos.find(v => v.id === entry.videoId)
  return {
    ...entry,
    title: metadata?.title ?? 'Unknown video',
    description: metadata?.description,
    thumbnailUrl: metadata?.thumbnailUrl,
    isEncrypted: metadata?.isEncrypted ?? false,
    arkivStatus: metadata?.arkivEntityStatus ?? 'unknown',
  }
})
```

### Eviction Notifies Arkiv Cache

When a video is removed from the content cache (individual or bulk), the arkiv-cache metadata must be updated:

```typescript
const handleRemove = async (videoId: string) => {
  await deleteVideo(videoId)
  
  // Notify arkiv-cache
  const cacheService = getVideoCacheService(walletAddress)
  cacheService.updateVideoCacheStatus(videoId, 'not-cached').catch(() => {})
  
  loadData()
}

const handleClearAll = async () => {
  // Get all cached video IDs before clearing
  const entries = await listCachedVideos()
  
  await clearAllVideos()
  
  // Notify arkiv-cache for each video
  const cacheService = getVideoCacheService(walletAddress)
  for (const entry of entries) {
    cacheService.updateVideoCacheStatus(entry.videoId, 'not-cached').catch(() => {})
  }
  
  loadData()
}
```

### Danger Zone — Combined Clear Warning

When clearing the video content cache, warn users about the impact:

```tsx
<AlertDialogDescription>
  This will remove {entries.length} cached video(s) ({formatBytes(totalContentSize)}).
  You will need to re-decrypt them on next play, which requires a wallet signature.
  Your video metadata (titles, descriptions) will NOT be affected.
</AlertDialogDescription>
```

When clearing the metadata cache (from arkiv-cache section), warn about orphaned content:

```tsx
<AlertDialogDescription>
  This will remove all cached video metadata. 
  {contentCachedCount > 0 && (
    ` Note: ${contentCachedCount} video(s) have cached content that will become orphaned 
    (no metadata to identify them). Consider clearing the video content cache first.`
  )}
</AlertDialogDescription>
```

## Acceptance Criteria

- [ ] Storage overview shows usage, quota, and percentage with visual bar
- [ ] Cached videos list shows all entries with metadata (titles from arkiv-cache)
- [ ] Individual videos can be removed from cache
- [ ] "Clear All" removes all cached videos with confirmation
- [ ] TTL setting is configurable and persisted
- [ ] Prefetch toggle enables/disables background prefetching
- [ ] Clear-on-disconnect toggle is configurable and persisted
- [ ] Settings persist across page reloads (Zustand persist)
- [ ] Empty state shown when no videos are cached
- [ ] Refresh button reloads cache data
- [ ] Responsive layout works on mobile
- [ ] Extends existing `CacheManagement.tsx` from arkiv-cache (not a new component)
- [ ] Fills in `contentStats` in the shared `useCacheStatus` hook
- [ ] Eviction updates arkiv-cache metadata via `updateVideoCacheStatus`
- [ ] Danger zone warns about metadata/content cache interaction

## Dependencies

- Task 1.2 (Cache API Wrapper)
- Task 3.3 (Cache TTL — settings feed into expiration config)
- Task 4.4 (Prefetch — settings control prefetch behavior)
- [Arkiv Cache Sprint 4](../../arkiv-cache/sprint-4/02-cache-management-settings.md) — provides the base `CacheManagement.tsx` component and `useCacheStatus` hook

## Estimated Effort

Large (6-8 hours)
