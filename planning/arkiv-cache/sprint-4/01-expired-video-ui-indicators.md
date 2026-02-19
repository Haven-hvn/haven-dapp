# Task 4.1 — Expired Video UI Indicators

**Sprint:** 4 — UX & Polish  
**Estimate:** 3–4 hours  
**Files:** `src/components/library/VideoCard.tsx` (modify), `src/components/library/CacheStatusBadge.tsx` (new), `src/components/library/ExpirationBanner.tsx` (new)

## Objective

Add visual indicators throughout the UI to distinguish between active Arkiv videos and expired (cache-only) videos. Users should clearly understand which videos are still on-chain and which are preserved only in their local cache.

## Background

After the cache integration, the library will show a mix of active videos (still on Arkiv) and expired videos (only in local cache). Without visual distinction, users won't know which videos are at risk or which are cache-only. Clear indicators build trust and help users understand the system.

## Prerequisites

- Sprint 2 completed (cache integration)
- Sprint 3 Task 3.2 (expiration tracking)

## Requirements

### 1. `CacheStatusBadge` Component (Shared with Video Content Cache)

> **Shared Component:** This badge serves **both** the arkiv-cache (metadata status) and the [video-cache](../../video-cache/) (content cache status). Design the interface to accommodate both dimensions from the start, even though video-cache fields will default during arkiv-cache implementation.

A small badge that indicates the source/status of a video:

```typescript
// src/components/library/CacheStatusBadge.tsx

interface CacheStatusBadgeProps {
  /** Arkiv entity status (from arkiv-cache) */
  arkivStatus: 'active' | 'expired' | 'expiring-soon' | 'cache-only'
  
  /** Video content cache status (from video-cache, defaults to 'not-cached') */
  videoCacheStatus?: 'not-cached' | 'cached' | 'stale'
  
  size?: 'sm' | 'md'
  showLabel?: boolean
}

export function CacheStatusBadge({ 
  arkivStatus, 
  videoCacheStatus = 'not-cached',
  size = 'sm', 
  showLabel = true 
}: CacheStatusBadgeProps) {
  // Visual variants (arkiv status — primary indicator):
  // 'active'        → Green dot + "On-chain"
  // 'expired'       → Amber dot + "Cached locally"
  // 'expiring-soon' → Orange pulse dot + "Expiring soon"
  // 'cache-only'    → Gray dot + "Local only"
  
  // Video content overlay (secondary indicator, shown alongside arkiv status):
  // 'cached'        → Small download/check icon overlay → "Video saved offline"
  // 'stale'         → Small warning icon overlay → "Video may be outdated"
  // 'not-cached'    → No overlay (default)
}
```

**Design specs:**
- `active`: Green circle indicator, subtle, doesn't draw attention
- `expired`: Amber/yellow indicator with "Cached locally" label
- `expiring-soon`: Orange pulsing indicator with "Expiring soon" label
- `cache-only`: Gray indicator (for videos that were never on Arkiv — future use)
- `videoCacheStatus === 'cached'`: Small checkmark/download icon overlaid on the badge (indicates decrypted content is also cached for instant playback). This overlay is added by the [video-cache](../../video-cache/) system later.
- Small size (`sm`) for video cards, medium (`md`) for detail views

### 2. Modify Video Card

Add the badge to the existing video card component:

```tsx
// In VideoCard.tsx, add badge overlay:

<div className="relative">
  {/* Existing thumbnail */}
  <VideoThumbnail ... />
  
  {/* Cache status badge — top-right corner */}
  {video.arkivStatus && video.arkivStatus !== 'active' && (
    <div className="absolute top-2 right-2">
      <CacheStatusBadge 
        status={video.arkivStatus === 'expired' ? 'expired' : 'active'} 
        size="sm"
        showLabel={false}
      />
    </div>
  )}
</div>

{/* In the card footer/metadata area */}
{video.arkivStatus === 'expired' && (
  <p className="text-xs text-amber-500 mt-1">
    Preserved in local cache
  </p>
)}
```

### 3. `ExpirationBanner` Component

A banner shown at the top of the library when videos are expiring soon:

```typescript
// src/components/library/ExpirationBanner.tsx

interface ExpirationBannerProps {
  expiringCount: number
  expiredCount: number
  onDismiss?: () => void
}

export function ExpirationBanner({ expiringCount, expiredCount, onDismiss }: ExpirationBannerProps) {
  // Show different messages based on state:
  
  // If videos are expiring soon:
  // "⚠️ {count} video(s) will expire from Arkiv within 24 hours. 
  //  Your data is safely cached locally."
  
  // If videos recently expired:
  // "ℹ️ {count} video(s) are no longer on Arkiv but are preserved 
  //  in your local cache."
  
  // Dismissible — user can close the banner
  // Re-appears if new expirations are detected
}
```

### 4. Video Detail View Indicators

On the watch/detail page, show more detailed cache status:

```tsx
// In the video detail/player page:

{video.arkivStatus === 'expired' && (
  <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-4">
    <div className="flex items-center gap-2">
      <AlertTriangle className="h-5 w-5 text-amber-500" />
      <div>
        <p className="font-medium text-amber-800 dark:text-amber-200">
          This video's metadata is preserved locally
        </p>
        <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
          The Arkiv entity has expired. Your video data is safely stored in your 
          browser's local cache. The video content on Filecoin (via Synapse SDK) is still accessible.
        </p>
      </div>
    </div>
  </div>
)}

{video.arkivStatus === 'expiring-soon' && (
  <div className="bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-lg p-4 mb-4">
    <p className="font-medium text-orange-800 dark:text-orange-200">
      ⏳ This video's Arkiv entity expires in approximately {timeRemaining}
    </p>
    <p className="text-sm text-orange-600 dark:text-orange-400 mt-1">
      Don't worry — your data will be automatically preserved in your local cache.
    </p>
  </div>
)}
```

### 5. Library Filter for Cache Status

Add a filter option to the library to show/hide expired videos:

```tsx
// In the library filter bar:

<div className="flex items-center gap-2">
  <label className="flex items-center gap-1.5 text-sm">
    <input 
      type="checkbox" 
      checked={showExpiredVideos}
      onChange={toggleShowExpiredVideos}
      className="rounded"
    />
    Show expired videos
  </label>
  
  {expiredCount > 0 && (
    <span className="text-xs text-muted-foreground">
      ({expiredCount} cached locally)
    </span>
  )}
</div>
```

### 6. Empty State for Cache-Only Library

When all videos have expired and only cache remains:

```tsx
{videos.length > 0 && activeVideos.length === 0 && (
  <div className="text-center py-8">
    <Database className="h-12 w-12 text-amber-500 mx-auto mb-3" />
    <h3 className="text-lg font-medium">All videos preserved locally</h3>
    <p className="text-muted-foreground mt-1 max-w-md mx-auto">
      Your Arkiv entities have expired, but all video metadata is safely 
      stored in your browser's local cache. Video content is still 
      accessible on Filecoin (via Synapse SDK).
    </p>
  </div>
)}
```

## Relationship to Video Content Cache

> **Cross-reference:** [Video Content Cache](../../video-cache/) — Service Worker + Cache API for decrypted video bytes.

The UI components built here are designed to serve **both** cache systems:

1. **`CacheStatusBadge`** accepts both `arkivStatus` and `videoCacheStatus` props. During arkiv-cache implementation, `videoCacheStatus` defaults to `'not-cached'`. When the video-cache is implemented later, it passes the actual content cache status, and the badge shows a secondary overlay indicator (e.g., a small checkmark for "video saved offline").

2. **Video detail view** should reserve space for video content cache info. The expired entity banner says "The video content on Filecoin (via Synapse SDK) is still accessible." — once video-cache is implemented, this can be enhanced to say "Video content is cached for instant playback" when `videoCacheStatus === 'cached'`.

3. **Library filter** should anticipate a future "Show only cached videos" filter that combines both metadata and content cache status.

The goal is that these components need **zero breaking changes** when the video-cache system is added — only new props are passed in.

## Visual Design Guidelines

- **Don't alarm users** — Expired doesn't mean lost. Use warm amber tones, not red.
- **Be reassuring** — Always mention that data is "safely cached" or "preserved locally."
- **Subtle for active** — Active videos shouldn't show any badge (it's the default state).
- **Progressive disclosure** — Show minimal info on cards, detailed info on hover/detail view.
- **Dark mode support** — All indicators must work in both light and dark themes.
- **Accessible** — Use both color AND text/icons (don't rely on color alone).
- **Forward-compatible** — Design component interfaces to accept video-cache props without breaking changes.

## Acceptance Criteria

- [ ] `CacheStatusBadge` renders correctly for all status variants
- [ ] Video cards show expired indicator for cache-only videos
- [ ] `ExpirationBanner` appears when videos are expiring soon
- [ ] Video detail page shows detailed cache status
- [ ] Library filter allows hiding/showing expired videos
- [ ] Empty state handles all-expired scenario gracefully
- [ ] All indicators work in dark mode
- [ ] Indicators are accessible (screen reader friendly)
- [ ] Active videos show no badge (clean default state)
- [ ] Messaging is reassuring, not alarming

## Testing Notes

- Visual regression test with screenshots for each status variant
- Test dark mode rendering
- Test with 0 expired, some expired, all expired scenarios
- Test banner dismiss and re-appear behavior
- Test filter toggle with Zustand store integration