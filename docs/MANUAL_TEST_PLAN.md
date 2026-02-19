# Haven DApp Video Cache - Manual Test Plan

> **Sprint 1 Integration Testing Guide**
>
> This document provides step-by-step manual testing instructions for verifying the Service Worker + Cache API + `useVideoCache` pipeline.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Test 1: Service Worker Registration](#test-1-service-worker-registration)
3. [Test 2: First Play (Cache Miss)](#test-2-first-play-cache-miss)
4. [Test 3: Second Play (Cache Hit)](#test-3-second-play-cache-hit)
5. [Test 4: Video Seeking (Range Requests)](#test-4-video-seeking-range-requests)
6. [Test 5: Cache Eviction & Re-cache](#test-5-cache-eviction--re-cache)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before running manual tests:

1. **Environment**: Ensure the app is running locally or on a staging environment
   ```bash
   npm run dev
   ```

2. **Browser**: Use Chrome or Chromium-based browser for best DevTools support

3. **Clear State**: Clear all site data before starting:
   - DevTools → Application → Storage → Clear site data

4. **DevTools Setup**: Keep DevTools open on the **Application** tab for quick access to:
   - Service Workers
   - Cache Storage

---

## Test 1: Service Worker Registration

### Objective
Verify the Service Worker (`haven-sw.js`) is properly registered and activated.

### Steps

1. **Open the app** in Chrome at `http://localhost:3000`

2. **Open DevTools** → **Application** → **Service Workers**

3. **Verify registration**:
   - Look for `haven-sw.js` entry
   - Status should show: **"activated and is running"**
   - Scope should be: `/`

4. **Check console for registration messages**:
   ```
   [Haven SW] Install event
   [Haven SW] Activate event
   ```

### Expected Result

| Check | Expected |
|-------|----------|
| SW Script | `haven-sw.js` |
| Status | Activated |
| Scope | `/` |
| Update on reload | Optional but helpful for testing |

### Screenshots to Capture

- Service Workers panel showing activated state

---

## Test 2: First Play (Cache Miss)

### Objective
Verify the full decryption pipeline runs on first video play and stores video in cache.

### Steps

1. **Navigate to an encrypted video** (e.g., `/watch/{videoId}`)

2. **Observe the decryption progress UI**:
   - Should show stages: `fetching` → `authenticating` → `decrypting` → `caching`
   - Progress bar should advance through each stage

3. **Wait for video to play** - should start after decryption completes

4. **Open DevTools** → **Application** → **Cache Storage** → `haven-video-cache-v1`

5. **Verify cache entry exists**:
   - Look for entry: `http://localhost:3000/haven/v/{videoId}`
   - Click to view details

6. **Verify headers** (in Cache Storage entry):
   | Header | Expected Value |
   |--------|---------------|
   | `Content-Type` | `video/mp4` (or actual MIME type) |
   | `X-Haven-Video-Id` | The video ID |
   | `X-Haven-Cached-At` | ISO timestamp |
   | `X-Haven-Size` | Size in bytes |
   | `Accept-Ranges` | `bytes` |

### Expected Result

- ✅ Decryption progress UI shows all stages
- ✅ Video plays after decryption
- ✅ Cache entry exists in `haven-video-cache-v1`
- ✅ Custom headers are present and correct

### Screenshots to Capture

- Decryption progress UI showing stages
- Cache Storage showing entry with headers

---

## Test 3: Second Play (Cache Hit)

### Objective
Verify cached video plays instantly without re-decryption.

### Steps

1. **Navigate away** from the video page (e.g., click back to Library)

2. **Navigate back** to the same video

3. **Observe loading behavior**:
   - Should see minimal to no loading time
   - No wallet popup
   - No decryption progress UI

4. **Verify DevTools Network tab**:
   - Open DevTools → **Network** tab
   - Look for request to `/haven/v/{videoId}`
   - **Size column** should show `(ServiceWorker)`
   - **Time** should be very fast (< 50ms)

5. **Verify component state**:
   - Open React DevTools or console
   - Check `isCached` state is `true`

### Expected Result

| Metric | Cache Miss | Cache Hit |
|--------|-----------|-----------|
| Load time | 5-30s | < 100ms |
| Wallet popup | Yes | No |
| Decryption UI | Full stages | None |
| Network source | Network / IPFS | ServiceWorker |
| `isCached` state | `false` → `true` | `true` |

### Screenshots to Capture

- Network tab showing `(ServiceWorker)` in Size column
- Video playing instantly

---

## Test 4: Video Seeking (Range Requests)

### Objective
Verify video seeking works smoothly with Range request handling.

### Steps

1. **Play a cached video** (complete Test 2 or 3 first)

2. **Seek to different positions**:
   - Click on progress bar at various points (10%, 50%, 90%)
   - Use keyboard arrow keys to seek
   - Drag progress bar handle

3. **Observe behavior**:
   - Video should seek smoothly without errors
   - No re-buffering from start

4. **Check console for errors**:
   - Open DevTools → **Console**
   - Filter for errors
   - Should see no errors related to video playback

5. **Verify Range requests in Network tab** (optional):
   - Open Network tab
   - Look for requests with `206 Partial Content` status
   - Check `Content-Range` header in response

### Expected Result

- ✅ Seeking works smoothly at all positions
- ✅ No console errors
- ✅ Range requests return `206` status
- ✅ No full re-download of video

### Screenshots to Capture

- Video playing after seek
- Network tab showing 206 responses

---

## Test 5: Cache Eviction & Re-cache

### Objective
Verify cache eviction works and video re-caches correctly.

### Steps

1. **Ensure video is cached** (complete Test 2)

2. **Verify cache exists** in DevTools → Application → Cache Storage

3. **Clear the cache**:
   - Right-click on `haven-video-cache-v1`
   - Select **Delete**
   - Or click entry and click **Delete** button

4. **Reload the video page**:
   - Navigate away and back, OR
   - Refresh the page

5. **Observe behavior**:
   - Full decryption pipeline should run again
   - Progress UI should show: `fetching` → `authenticating` → `decrypting` → `caching`

6. **Verify re-caching**:
   - Check Cache Storage again
   - Entry should reappear with new timestamp

### Expected Result

| Step | Expected |
|------|----------|
| Cache deletion | Cache Storage empty |
| Page reload | Full decrypt pipeline runs |
| After decrypt | Video plays normally |
| Re-check cache | New entry with fresh timestamp |

### Screenshots to Capture

- Cache Storage before deletion
- Decryption progress during re-cache
- Cache Storage after re-cache

---

## Troubleshooting

### Service Worker Not Registering

**Symptom**: No SW entry in DevTools

**Solutions**:
1. Check console for errors
2. Ensure `NEXT_PUBLIC_ENABLE_SW_IN_DEV=true` in `.env.local` for development
3. Hard refresh: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
4. Unregister any existing SW and reload

### Cache Not Storing

**Symptom**: Cache Storage is empty after playing video

**Solutions**:
1. Check console for errors during decryption
2. Verify video is encrypted (non-encrypted videos may not cache)
3. Check `videoCacheStatus` in component state
4. Ensure sufficient storage quota

### Range Requests Failing

**Symptom**: Seeking doesn't work or causes errors

**Solutions**:
1. Check SW console for error messages
2. Verify `Accept-Ranges: bytes` header is present
3. Check video format supports streaming (MP4 with moov atom)
4. Test with different video files

### Cache Hit Not Working

**Symptom**: Video re-decrypts on second play

**Solutions**:
1. Verify cache entry exists before second play
2. Check video ID matches exactly
3. Clear cache and retry Test 2
4. Check SW is intercepting requests (Network tab)

---

## Quick Reference

### Cache API Names

| Name | Purpose |
|------|---------|
| `haven-video-cache-v1` | Video content storage |
| `haven-cache-{wallet}` | Video metadata (IndexedDB) |

### Key URLs

| Pattern | Handled By |
|---------|-----------|
| `/haven/v/{videoId}` | Service Worker (cache) |
| `/api/*` | Network |
| `/*` | Network / Next.js |

### Custom Headers

| Header | Description |
|--------|-------------|
| `X-Haven-Video-Id` | Video identifier |
| `X-Haven-Cached-At` | ISO timestamp |
| `X-Haven-Size` | Size in bytes |
| `X-Haven-TTL` | Expiration time (optional) |

---

## Sign-Off Checklist

- [ ] Test 1: Service Worker Registration passed
- [ ] Test 2: First Play (Cache Miss) passed
- [ ] Test 3: Second Play (Cache Hit) passed
- [ ] Test 4: Video Seeking passed
- [ ] Test 5: Cache Eviction & Re-cache passed

**Tester**: _________________  **Date**: _________________

**Notes**:
_________________________________________________________________
_________________________________________________________________
