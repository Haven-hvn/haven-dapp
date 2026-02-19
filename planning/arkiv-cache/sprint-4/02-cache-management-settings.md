# Task 4.2 — Cache Management Settings Page

**Sprint:** 4 — UX & Polish  
**Estimate:** 3–4 hours  
**Files:** `src/components/settings/CacheManagement.tsx` (new), `src/app/settings/page.tsx` (modify)

## Objective

Build a cache management section in the settings page that gives users visibility into and control over their local cache. Users should be able to view cache statistics, manually trigger syncs, clear the cache, and configure cache behavior.

## Background

The cache operates silently in the background, but power users and debugging scenarios require direct access to cache controls. This settings section provides transparency and control without cluttering the main library experience.

## Prerequisites

- Sprint 2 completed (cache integration)
- Sprint 3 Task 3.1 (background sync engine)

## Requirements

### 1. `CacheManagement` Component

```typescript
// src/components/settings/CacheManagement.tsx

export function CacheManagement() {
  const { stats, isSyncing, lastSyncedAt, lastSyncResult } = useCacheStore()
  const { showExpiredVideos, autoSyncEnabled, toggleShowExpiredVideos, toggleAutoSync } = useCachePreferences()
  const { forceSync } = useCachedVideos()
  
  return (
    <section>
      <h2>Local Cache</h2>
      
      {/* Cache Statistics */}
      {/* Cache Controls */}
      {/* Cache Preferences */}
      {/* Danger Zone */}
    </section>
  )
}
```

### 2. Cache Statistics Display

```tsx
<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
  <StatCard 
    label="Total Videos" 
    value={stats?.totalVideos ?? 0} 
    icon={<Film />} 
  />
  <StatCard 
    label="Active (On-chain)" 
    value={stats?.activeVideos ?? 0} 
    icon={<CheckCircle />}
    color="green" 
  />
  <StatCard 
    label="Expired (Cached)" 
    value={stats?.expiredVideos ?? 0} 
    icon={<Archive />}
    color="amber" 
  />
  <StatCard 
    label="Cache Size" 
    value={formatBytes(stats?.cacheSize ?? 0)} 
    icon={<HardDrive />} 
  />
</div>

{/* Storage usage bar */}
<div className="mt-4">
  <div className="flex justify-between text-sm text-muted-foreground mb-1">
    <span>Storage used</span>
    <span>{formatBytes(storageUsage)} / {formatBytes(storageQuota)}</span>
  </div>
  <div className="h-2 bg-muted rounded-full overflow-hidden">
    <div 
      className="h-full bg-primary rounded-full transition-all"
      style={{ width: `${(storageUsage / storageQuota) * 100}%` }}
    />
  </div>
</div>
```

### 3. Sync Controls

```tsx
<div className="space-y-4">
  {/* Last sync info */}
  <div className="flex items-center justify-between">
    <div>
      <p className="text-sm font-medium">Last synced</p>
      <p className="text-xs text-muted-foreground">
        {lastSyncedAt 
          ? formatRelativeTime(lastSyncedAt) 
          : 'Never synced'}
      </p>
    </div>
    <Button 
      onClick={forceSync} 
      disabled={isSyncing}
      variant="outline"
      size="sm"
    >
      {isSyncing ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          Syncing...
        </>
      ) : (
        <>
          <RefreshCw className="h-4 w-4 mr-2" />
          Sync Now
        </>
      )}
    </Button>
  </div>

  {/* Last sync result */}
  {lastSyncResult && (
    <div className="text-xs text-muted-foreground bg-muted rounded-lg p-3">
      <p>Last sync: {formatRelativeTime(lastSyncResult.syncedAt)}</p>
      <p>
        +{lastSyncResult.added} added, 
        ~{lastSyncResult.updated} updated, 
        -{lastSyncResult.expired} expired, 
        ={lastSyncResult.unchanged} unchanged
      </p>
      {lastSyncResult.errors.length > 0 && (
        <p className="text-destructive mt-1">
          {lastSyncResult.errors.length} error(s)
        </p>
      )}
    </div>
  )}
</div>
```

### 4. Cache Preferences

```tsx
<div className="space-y-4">
  <h3 className="text-sm font-medium">Preferences</h3>
  
  {/* Auto-sync toggle */}
  <div className="flex items-center justify-between">
    <div>
      <p className="text-sm">Auto-sync</p>
      <p className="text-xs text-muted-foreground">
        Periodically sync with Arkiv in the background
      </p>
    </div>
    <Switch 
      checked={autoSyncEnabled} 
      onCheckedChange={toggleAutoSync} 
    />
  </div>

  {/* Show expired videos toggle */}
  <div className="flex items-center justify-between">
    <div>
      <p className="text-sm">Show expired videos</p>
      <p className="text-xs text-muted-foreground">
        Display videos whose Arkiv entities have expired
      </p>
    </div>
    <Switch 
      checked={showExpiredVideos} 
      onCheckedChange={toggleShowExpiredVideos} 
    />
  </div>
</div>
```

### 5. Danger Zone

```tsx
<div className="border border-destructive/20 rounded-lg p-4 mt-6">
  <h3 className="text-sm font-medium text-destructive">Danger Zone</h3>
  
  {/* Clear expired entries */}
  <div className="flex items-center justify-between mt-4">
    <div>
      <p className="text-sm">Clear expired entries</p>
      <p className="text-xs text-muted-foreground">
        Remove videos that are no longer on Arkiv. 
        This data cannot be recovered.
      </p>
    </div>
    <Button 
      variant="outline" 
      size="sm"
      className="text-destructive border-destructive/30"
      onClick={handleClearExpired}
    >
      Clear Expired
    </Button>
  </div>

  {/* Clear all cache */}
  <div className="flex items-center justify-between mt-4">
    <div>
      <p className="text-sm">Clear all cached data</p>
      <p className="text-xs text-muted-foreground">
        Remove all locally cached video metadata. 
        Active videos will be re-fetched from Arkiv.
      </p>
    </div>
    <Button 
      variant="destructive" 
      size="sm"
      onClick={handleClearAll}
    >
      Clear Cache
    </Button>
  </div>
</div>
```

### 6. Confirmation Dialogs

Use the existing Radix Dialog for destructive actions:

```tsx
<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="destructive" size="sm">Clear Cache</Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Clear all cached data?</AlertDialogTitle>
      <AlertDialogDescription>
        This will remove all {stats?.totalVideos ?? 0} cached video records 
        from your browser. Active videos will be re-fetched from Arkiv, 
        but expired video metadata ({stats?.expiredVideos ?? 0} videos) 
        will be permanently lost.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={handleClearAll}>
        Clear All Data
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

### 7. Integrate into Settings Page

Add the cache management section to the existing settings page:

```tsx
// src/app/settings/page.tsx

import { CacheManagement } from '@/components/settings/CacheManagement'

export default function SettingsPage() {
  return (
    <ProtectedRoute>
      <SettingsLayout>
        {/* ... existing settings sections ... */}
        
        <section className="mt-8">
          <CacheManagement />
        </section>
      </SettingsLayout>
    </ProtectedRoute>
  )
}
```

## Helper Utilities

```typescript
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`
  return `${Math.floor(seconds / 86400)} days ago`
}
```

## Relationship to Video Content Cache

> **Cross-reference:** [Video Content Cache](../../video-cache/) — Service Worker + Cache API for decrypted video bytes.

This settings page is designed as the **single cache management UI** for both cache systems. During arkiv-cache implementation, it shows metadata cache stats only. When the video-cache is implemented later, it adds a second section for video content cache.

### Forward-Compatible Layout

Design the component with a section-based layout that can accommodate the video content cache:

```tsx
<section>
  <h2>Local Cache</h2>
  
  {/* Section 1: Metadata Cache (arkiv-cache — implemented now) */}
  <div>
    <h3>Video Metadata</h3>
    {/* Stats, sync controls, preferences as described above */}
  </div>
  
  {/* Section 2: Video Content Cache (video-cache — placeholder for now) */}
  <div>
    <h3>Video Content</h3>
    {/* 
      Placeholder during arkiv-cache implementation:
      "Video content caching is not yet available."
      
      When video-cache is implemented, this section shows:
      - Number of cached videos (content)
      - Total content cache size (from Cache API storage estimate)
      - "Clear Video Cache" button
      - Per-video eviction controls
    */}
  </div>
  
  {/* Danger Zone: Combined clear for both caches */}
</section>
```

### Stats Interface (Forward-Compatible)

The `CacheStats` type should include optional video content cache fields:

```typescript
interface UnifiedCacheStats extends CacheStats {
  // Video content cache stats (populated by video-cache system)
  contentCachedVideos?: number    // Videos with cached decrypted content
  contentCacheSize?: number       // Estimated size of cached video content
}
```

The `useCacheStatus` hook should return both metadata and content cache stats:

```typescript
interface UseCacheStatusReturn {
  // Metadata cache (arkiv-cache)
  metadataStats: CacheStats | null
  
  // Video content cache (video-cache — null until implemented)
  contentStats: ContentCacheStats | null
  
  // Combined
  totalCacheSize: number
  isLoading: boolean
}
```

During arkiv-cache implementation, `contentStats` returns `null`. The video-cache system fills it in later.

## Acceptance Criteria

- [ ] Cache statistics display correctly (total, active, expired, size)
- [ ] Storage usage bar shows browser storage consumption
- [ ] "Sync Now" button triggers manual sync with loading state
- [ ] Last sync result is displayed with add/update/expire counts
- [ ] Auto-sync toggle persists preference
- [ ] Show expired videos toggle persists preference
- [ ] "Clear Expired" removes only expired entries with confirmation
- [ ] "Clear Cache" removes all entries with confirmation dialog
- [ ] Confirmation dialogs show accurate counts
- [ ] Settings section integrates cleanly with existing settings page
- [ ] All controls work in dark mode
- [ ] Loading/disabled states prevent double-clicks
- [ ] Layout accommodates future video content cache section
- [ ] `useCacheStatus` hook interface includes video content cache fields (returning null/defaults)

## Testing Notes

- Test with empty cache (all stats should be 0)
- Test with mixed active/expired videos
- Test clear expired → verify only expired removed
- Test clear all → verify cache is empty, then re-fetches from Arkiv
- Test sync button during active sync (should be disabled)
- Test preference toggles persist across page reload