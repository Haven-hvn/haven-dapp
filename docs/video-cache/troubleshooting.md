# Video Cache Troubleshooting Guide

Common issues and solutions for the Haven video cache system.

## Table of Contents

- [Quick Reference Table](#quick-reference-table)
- [Video Doesn't Play from Cache](#video-doesnt-play-from-cache)
- [Cache Not Persisting](#cache-not-persisting)
- [Wallet Popup on Every Video](#wallet-popup-on-every-video)
- [High Memory Usage](#high-memory-usage)
- [Video Plays But No Audio](#video-plays-but-no-audio)
- [Slow First Playback](#slow-first-playback)
- [Cache Not Clearing](#cache-not-clearing)
- [Service Worker Issues](#service-worker-issues)
- [Storage Quota Exceeded](#storage-quota-exceeded)
- [OPFS Errors](#opfs-errors)

## Quick Reference Table

| Issue | Cause | Solution |
|-------|-------|----------|
| Video doesn't play from cache | SW not registered | Check HTTPS, check DevTools → Application |
| Cache not persisting | Browser eviction | Request persistent storage in settings |
| Wallet popup on every video | Session cache miss | Check Lit session expiration |
| High memory usage | OPFS not available | Check browser support, use Chrome |
| Video plays but no audio | Incorrect MIME type | Check `originalMimeType` in metadata |
| Slow first playback | Network/decryption latency | Normal behavior, should be <100ms on repeat |
| Cache not clearing | Stuck entries | Use DevTools → Application → Clear storage |
| Service Worker not updating | Cache headers | Hard refresh (Ctrl+Shift+R) or unregister SW |
| Storage quota exceeded | Too many/large videos | Clear old videos or enable auto-eviction |
| OPFS write fails | Browser incompatibility | Use Chrome 86+, Edge 86+, or Firefox 111+ |

## Video Doesn't Play from Cache

### Symptoms
- Video plays but doesn't show "Cached" badge
- Loading stages show every time (fetching → authenticating → decrypting)
- Network tab shows video being fetched from network

### Diagnosis

1. **Check Service Worker status:**
   ```javascript
   // In browser console
   await navigator.serviceWorker.ready
   // Should return ServiceWorkerRegistration
   ```

2. **Verify cache contents:**
   ```javascript
   const cache = await caches.open('haven-video-cache-v1')
   const keys = await cache.keys()
   console.log('Cached:', keys.map(k => k.url))
   ```

3. **Check if video URL is correct:**
   ```javascript
   // Should be /haven/v/{videoId}
   console.log('Video URL:', videoUrl)
   ```

### Solutions

#### Solution 1: Check HTTPS
Service Workers require a secure context (HTTPS or localhost).

```javascript
console.log('Is secure context:', window.isSecureContext)
```

If `false`, the cache system will be disabled. Use HTTPS in production.

#### Solution 2: Register Service Worker

```typescript
// Ensure ServiceWorkerProvider wraps your app
import { ServiceWorkerProvider } from '@/components/providers/ServiceWorkerProvider'

export default function App({ children }) {
  return (
    <ServiceWorkerProvider>
      {children}
    </ServiceWorkerProvider>
  )
}
```

#### Solution 3: Check for SW Errors

Open DevTools → Console and look for:
```
[Haven SW] Activated
[Haven SW] Handled video request: /haven/v/...
```

If you see errors, try:
1. DevTools → Application → Service Workers → Unregister
2. Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
3. Check for JavaScript errors in the SW

## Cache Not Persisting

### Symptoms
- Videos work immediately after caching
- After closing and reopening browser, videos need to be re-fetched
- Cache appears empty after browser restart

### Diagnosis

Check persistence status:
```javascript
const persisted = await navigator.storage.persisted()
console.log('Storage persisted:', persisted)
```

### Solutions

#### Solution 1: Request Persistent Storage

```typescript
import { requestPersistentStorage } from '@/lib/storage-persistence'

const granted = await requestPersistentStorage()
if (granted) {
  console.log('Storage is now persistent')
} else {
  console.log('Storage may be evicted - bookmark this site or install as PWA')
}
```

#### Solution 2: Check Storage Estimate

```javascript
const estimate = await navigator.storage.estimate()
console.log(`Using ${(estimate.usage / estimate.quota * 100).toFixed(1)}% of quota`)
console.log('Quota:', estimate.quota, 'bytes')
```

If usage is close to quota:
- Clear old videos manually
- Enable automatic eviction (enabled by default)
- Reduce `maxCachedVideos` in config

#### Solution 3: Browser-Specific Notes

**Chrome:**
- Auto-grants persistence if site is:
  - Bookmarked
  - Installed as PWA
  - Has push notifications enabled
  - Has high engagement score

**Firefox:**
- Shows permission dialog to user
- User must explicitly grant

**Safari:**
- No persistent storage API
- Uses heuristics to decide eviction
- Limited Service Worker support

## Wallet Popup on Every Video

### Symptoms
- Metamask/wallet popup appears for every video playback
- "Authenticating" stage takes 1-3 seconds each time
- Session doesn't seem to be cached

### Diagnosis

Check session cache status:
```typescript
import { getSessionInfo, hasCachedSession } from '@/lib/lit-session-cache'

const address = '0x...' // user's address
console.log('Has cached session:', hasCachedSession(address))
console.log('Session info:', getSessionInfo(address))
```

### Solutions

#### Solution 1: Check Session Expiration

Sessions expire after 1 hour by default. Check if expired:
```typescript
import { getSessionInfo } from '@/lib/lit-session-cache'

const info = getSessionInfo(address)
if (info.isCached) {
  console.log(`Session expires in ${info.expiresIn / 1000} seconds`)
}
```

#### Solution 2: Wallet Disconnect/Account Change

Sessions are cleared on wallet disconnect. If your app disconnects the wallet between videos, sessions won't persist.

Check if cleanup is being triggered:
```typescript
// Add logging to security-cleanup.ts temporarily
export function onWalletDisconnect(address: string) {
  console.log('[SecurityCleanup] Wallet disconnected:', address)
  // ... rest of function
}
```

#### Solution 3: Extend Session TTL

```typescript
import { setCachedAuthContext } from '@/lib/lit-session-cache'

// Cache with longer TTL (e.g., 2 hours)
setCachedAuthContext(address, authContext, 2 * 60 * 60 * 1000)
```

## High Memory Usage

### Symptoms
- Browser tab crashes during video playback
- "Out of memory" errors in console
- High memory usage shown in Task Manager

### Diagnosis

Check if OPFS is available:
```typescript
import { isOpfsAvailable } from '@/lib/opfs'

console.log('OPFS available:', isOpfsAvailable())
```

Check memory usage:
```javascript
// Chrome only
console.log('Memory:', performance.memory)
// { usedJSHeapSize: ..., totalJSHeapSize: ..., jsHeapSizeLimit: ... }
```

### Solutions

#### Solution 1: Use Chrome or Edge

OPFS has best support in Chromium-based browsers. Firefox and Safari have limited or no support.

#### Solution 2: Reduce Memory Threshold

Lower the threshold for using OPFS staging:

```typescript
// In browser-capabilities.ts or at runtime
const config = buildCacheConfig(capabilities)
config.maxInMemorySize = 100 * 1024 * 1024  // 100MB instead of 500MB
```

#### Solution 3: Clear Cache Regularly

```typescript
import { startPeriodicCleanup } from '@/lib/cache-expiration'

// More aggressive cleanup
startPeriodicCleanup({
  maxCachedVideos: 10,        // Keep fewer videos
  storageThreshold: 0.5,      // Clean at 50% storage usage
  cleanupInterval: 10 * 60 * 1000,  // Every 10 minutes
})
```

#### Solution 4: Profile Memory Usage

Use Chrome DevTools Memory tab:
1. Take heap snapshot before playing video
2. Play video
3. Take heap snapshot after
4. Compare to find memory leaks

Common causes:
- Blob URLs not revoked
- Event listeners not cleaned up
- Large arrays not garbage collected

## Video Plays But No Audio

### Symptoms
- Video plays normally
- No audio output
- Video element shows muted icon

### Diagnosis

Check MIME type:
```typescript
const result = await getVideo(videoId)
if (result) {
  console.log('MIME type:', result.metadata.mimeType)
}
```

Check video metadata:
```typescript
const video = document.querySelector('video')
console.log('Video codecs:', video?.canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"'))
```

### Solutions

#### Solution 1: Check originalMimeType

When caching, preserve the original MIME type:

```typescript
import { putVideo } from '@/lib/video-cache'

const mimeType = video.litEncryptionMetadata?.originalMimeType || 'video/mp4'
await putVideo(videoId, blob, mimeType)
```

Common MIME types:
- `video/mp4` - MP4 container (most common)
- `video/webm` - WebM container
- `video/mp4; codecs="avc1.42E01E, mp4a.40.2"` - H.264 + AAC
- `video/webm; codecs="vp9, opus"` - VP9 + Opus

#### Solution 2: Verify Decryption

Audio may fail if decryption is incomplete:
```typescript
// Check if video is fully decrypted
const result = await getVideo(videoId)
if (result) {
  const blob = await result.response.blob()
  console.log('Video size:', blob.size)
  console.log('Expected size:', expectedSize)
}
```

#### Solution 3: Test with Original File

Compare cached video with original:
```typescript
// Download original encrypted file
// Decrypt manually
// Compare with cached version
```

## Slow First Playback

### Symptoms
- First play takes 5-30+ seconds
- Subsequent plays are fast (<100ms)
- User sees loading spinner for extended period

### Expected Behavior

This is **normal** for cache miss:

| Stage | Expected Time |
|-------|---------------|
| Check cache | <10ms |
| Fetch from network | 2-10s (depends on size) |
| Authenticate (cold) | 1-3s (wallet signature) |
| Authenticate (warm) | <100ms (cached session) |
| Decrypt key via Lit | 500ms-2s (network + crypto) |
| Decrypt video | 100ms-2s (depends on size) |
| Write to cache | 100ms-1s (depends on size) |
| **Total (cold)** | **5-30s** |
| **Total (warm)** | **3-15s** |
| **Cache hit** | **<100ms** |

### Solutions

#### Solution 1: Pre-fetch Videos

```typescript
import { usePrefetch } from '@/hooks/usePrefetch'

function VideoLibrary({ videos }) {
  const { prefetch, isPrefetching } = usePrefetch()
  
  // Prefetch when hovering or on mount
  const handleHover = (video) => {
    prefetch(video)
  }
  
  return (
    <div>
      {videos.map(v => (
        <VideoCard 
          key={v.id} 
          video={v}
          onHover={() => handleHover(v)}
        />
      ))}
    </div>
  )
}
```

#### Solution 2: Show Progress Indicators

Use the loading stages to show detailed progress:

```tsx
function LoadingProgress({ stage, progress }: { stage: LoadingStage, progress: number }) {
  const stageLabels: Record<LoadingStage, string> = {
    'checking-cache': 'Checking cache...',
    'fetching': 'Downloading...',
    'authenticating': 'Authenticating...',
    'decrypting': 'Decrypting...',
    'caching': 'Caching for instant playback...',
    'ready': 'Ready!',
    'error': 'Error loading video',
  }
  
  return (
    <div>
      <div className="progress-bar">
        <div className="fill" style={{ width: `${progress}%` }} />
      </div>
      <p>{stageLabels[stage]}</p>
    </div>
  )
}
```

#### Solution 3: Optimize for Repeat Views

The cache system is designed for repeat views. Emphasize this to users:
- "First play may take a moment"
- "Subsequent plays will be instant"
- Show "Cached" badge to indicate future speed

## Cache Not Clearing

### Symptoms
- Videos remain after calling `deleteVideo()`
- `clearAllVideos()` doesn't remove entries
- Storage usage doesn't decrease

### Diagnosis

Check cache state:
```javascript
const cache = await caches.open('haven-video-cache-v1')
const keys = await cache.keys()
console.log('Cache entries:', keys.length)
```

### Solutions

#### Solution 1: Force Delete

```typescript
import { deleteVideo, hasVideo } from '@/lib/video-cache'

async function forceDelete(videoId: string) {
  // Try multiple times
  for (let i = 0; i < 3; i++) {
    await deleteVideo(videoId)
    const stillExists = await hasVideo(videoId)
    if (!stillExists) break
    await new Promise(r => setTimeout(r, 100))
  }
}
```

#### Solution 2: DevTools Manual Clear

1. DevTools → Application → Cache Storage
2. Right-click `haven-video-cache-v1`
3. Select "Delete cache"

#### Solution 3: Clear All Site Data

1. DevTools → Application → Storage
2. Check "Cache Storage" and "Application Cache"
3. Click "Clear site data"

#### Solution 4: Unregister Service Worker

1. DevTools → Application → Service Workers
2. Click "Unregister"
3. Hard refresh

## Service Worker Issues

### Symptoms
- Service Worker not updating after code changes
- Old SW still handling requests
- New features not working

### Diagnosis

Check SW version:
```javascript
// In console
const registration = await navigator.serviceWorker.ready
console.log('SW script URL:', registration.active?.scriptURL)
console.log('SW state:', registration.active?.state)
```

### Solutions

#### Solution 1: Hard Refresh

- Windows/Linux: `Ctrl + Shift + R`
- Mac: `Cmd + Shift + R`

#### Solution 2: Skip Waiting

Add to your SW registration:
```typescript
// In ServiceWorkerProvider
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload()
  })
}
```

#### Solution 3: Update on Reload

In DevTools:
1. Application → Service Workers
2. Check "Update on reload"
3. Check "Bypass for network" (temporary)

#### Solution 4: Unregister and Re-register

```javascript
// In console
const registrations = await navigator.serviceWorker.getRegistrations()
for (const reg of registrations) {
  await reg.unregister()
}
location.reload()
```

## Storage Quota Exceeded

### Symptoms
- `QuotaExceededError` in console
- Cannot cache new videos
- Browser may prompt to clear storage

### Diagnosis

Check storage usage:
```javascript
const estimate = await navigator.storage.estimate()
console.log(`Using ${(estimate.usage / 1024 / 1024).toFixed(1)} MB`)
console.log(`Quota: ${(estimate.quota / 1024 / 1024).toFixed(1)} MB`)
console.log(`Percent: ${(estimate.usage / estimate.quota * 100).toFixed(1)}%`)
```

### Solutions

#### Solution 1: Enable Auto-Eviction

Already enabled by default in `putVideo()`:
```typescript
await putVideo(videoId, data, mimeType, {
  retryOnQuotaExceeded: true,
  evictOnQuotaExceeded: true,
})
```

#### Solution 2: Reduce Cache Size

```typescript
import { startPeriodicCleanup } from '@/lib/cache-expiration'

startPeriodicCleanup({
  maxCachedVideos: 20,        // Lower limit
  storageThreshold: 0.5,      // Clean earlier
})
```

#### Solution 3: Request Persistent Storage

```typescript
await navigator.storage.persist()
// May increase quota in some browsers
```

#### Solution 4: Manual Cleanup

```typescript
import { listCachedVideos, deleteVideo } from '@/lib/video-cache'

async function cleanupLargeVideos() {
  const videos = await listCachedVideos()
  
  // Delete videos larger than 100MB
  for (const video of videos) {
    if (video.size > 100 * 1024 * 1024) {
      await deleteVideo(video.videoId)
      console.log('Deleted large video:', video.videoId)
    }
  }
}
```

## OPFS Errors

### Symptoms
- "OPFS not available" error
- Staging write fails
- Falls back to in-memory buffering

### Diagnosis

Check OPFS availability:
```typescript
import { isOpfsAvailable } from '@/lib/opfs'

console.log('OPFS available:', isOpfsAvailable())
console.log('Browser:', navigator.userAgent)
```

### Solutions

#### Solution 1: Use Supported Browser

OPFS requires:
- Chrome 86+
- Edge 86+
- Firefox 111+
- Safari 15.2+ (limited)

Safari has the most issues with OPFS. Recommend Chrome for best experience.

#### Solution 2: Check for Error Details

```typescript
import { writeToStaging, OpfsError } from '@/lib/opfs'

try {
  await writeToStaging(videoId, stream)
} catch (error) {
  if (error instanceof OpfsError) {
    console.log('OPFS Error code:', error.code)
    console.log('OPFS Error message:', error.message)
  }
}
```

Common error codes:
- `OPFS_NOT_AVAILABLE` - Browser doesn't support OPFS
- `STAGING_DIR_ERROR` - Can't access OPFS directory
- `FILE_CREATE_ERROR` - Can't create staging file
- `WRITE_ERROR` - Write operation failed

#### Solution 3: Disable OPFS in Unsupported Browsers

```typescript
import { detectCapabilities, buildCacheConfig } from '@/lib/browser-capabilities'

const caps = detectCapabilities()
const config = buildCacheConfig(caps)

if (!config.useOpfsStaging) {
  console.log('OPFS disabled:', config.disabledReasons)
  // App will use in-memory buffering instead
}
```

#### Solution 4: Increase In-Memory Limit

If OPFS is not available, increase memory threshold:

```typescript
// src/lib/browser-capabilities.ts

const DEFAULT_MEMORY_LIMITS = {
  default: 750 * 1024 * 1024,  // Increase from 500MB to 750MB
  safari: 500 * 1024 * 1024,   // Increase from 250MB
  mobile: 300 * 1024 * 1024,   // Increase from 200MB
}
```

**Note:** This may cause out-of-memory errors on devices with limited RAM.

---

## Getting More Help

If you're still experiencing issues:

1. **Check the console** for error messages with `[VideoCache]`, `[Haven SW]`, or `[CacheExpiration]` prefixes
2. **Enable debug logging**: `localStorage.setItem('haven-debug', 'true')` and refresh
3. **Run benchmarks**: `await havenBenchmarks.run()` in console
4. **Check browser compatibility**: Use `useCapabilities()` hook
5. **Review the architecture**: See [architecture.md](./architecture.md) for system understanding
