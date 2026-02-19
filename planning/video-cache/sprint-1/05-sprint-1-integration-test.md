# Task 1.5: Sprint 1 Integration Test

## Objective

Create an end-to-end integration test that validates the full Service Worker + Cache API + `useVideoCache` pipeline works correctly. This test ensures all Sprint 1 components work together before moving to optimization sprints.

## Background

Sprint 1 introduces three new layers (Service Worker, Cache API wrapper, `useVideoCache` hook) that must work together seamlessly. This task creates a manual test plan and automated tests to verify the integration.

## Requirements

### Manual Test Plan

A step-by-step manual test checklist for developers to verify the pipeline:

1. **Service Worker Registration**
   - Open the app in Chrome
   - Open DevTools → Application → Service Workers
   - Verify `haven-sw.js` is registered and active
   - Verify scope is `/`

2. **First Play (Cache Miss)**
   - Navigate to an encrypted video
   - Verify the decryption progress UI appears (fetching → authenticating → decrypting → caching)
   - Verify the video plays after decryption
   - Open DevTools → Application → Cache Storage → `haven-video-cache-v1`
   - Verify an entry exists for `/haven/v/{videoId}`
   - Verify the entry has correct `Content-Type` and custom `X-Haven-*` headers

3. **Second Play (Cache Hit)**
   - Navigate away from the video, then back
   - Verify the video plays **instantly** (no wallet popup, no decryption progress)
   - Verify DevTools Network tab shows the request served by Service Worker
   - Verify `isCached` is `true` in the component state

4. **Video Seeking**
   - Play a cached video
   - Seek to different positions
   - Verify seeking works smoothly (Range requests handled by SW)
   - Verify no errors in console

5. **Cache Eviction & Re-cache**
   - Clear the cache via DevTools → Application → Cache Storage → Delete
   - Reload the video page
   - Verify the full decrypt pipeline runs again (fetch → decrypt → cache → play)
   - Verify it re-caches after decryption

### Automated Test (`e2e/video-cache.spec.ts`)

```typescript
import { test, expect } from '@playwright/test'

test.describe('Video Cache Pipeline', () => {
  test('Service Worker registers successfully', async ({ page }) => {
    await page.goto('/')
    
    // Wait for SW to register
    const swReady = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready
      return reg.active?.state === 'activated'
    })
    
    expect(swReady).toBe(true)
  })
  
  test('SW intercepts /haven/v/* requests', async ({ page }) => {
    await page.goto('/')
    
    // Wait for SW
    await page.evaluate(() => navigator.serviceWorker.ready)
    
    // Request a non-cached video — should get 404 from SW
    const response = await page.evaluate(async () => {
      const res = await fetch('/haven/v/test-nonexistent')
      return { status: res.status, body: await res.text() }
    })
    
    expect(response.status).toBe(404)
  })
  
  test('SW passes through non-haven requests', async ({ page }) => {
    await page.goto('/')
    
    // Regular page navigation should work normally
    const response = await page.goto('/library')
    expect(response?.status()).toBe(200)
  })
  
  test('Cache API wrapper stores and retrieves video', async ({ page }) => {
    await page.goto('/')
    
    const result = await page.evaluate(async () => {
      // Import would be tricky in evaluate, so test the raw Cache API
      const cache = await caches.open('haven-video-cache-v1')
      const testData = new Uint8Array([1, 2, 3, 4, 5])
      const blob = new Blob([testData], { type: 'video/mp4' })
      
      const url = `${location.origin}/haven/v/test-video-123`
      
      await cache.put(url, new Response(blob, {
        headers: {
          'Content-Type': 'video/mp4',
          'X-Haven-Video-Id': 'test-video-123',
          'X-Haven-Cached-At': new Date().toISOString(),
          'X-Haven-Size': String(testData.length),
        },
      }))
      
      // Retrieve
      const cached = await cache.match(url)
      if (!cached) return { found: false }
      
      const data = new Uint8Array(await cached.blob().then(b => b.arrayBuffer()))
      
      // Cleanup
      await cache.delete(url)
      
      return {
        found: true,
        size: data.length,
        contentType: cached.headers.get('Content-Type'),
        videoId: cached.headers.get('X-Haven-Video-Id'),
      }
    })
    
    expect(result.found).toBe(true)
    expect(result.size).toBe(5)
    expect(result.contentType).toBe('video/mp4')
    expect(result.videoId).toBe('test-video-123')
  })
  
  test('SW serves cached video with Range request support', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => navigator.serviceWorker.ready)
    
    // Store a test video in cache
    await page.evaluate(async () => {
      const cache = await caches.open('haven-video-cache-v1')
      const testData = new Uint8Array(1000).fill(42)
      const blob = new Blob([testData], { type: 'video/mp4' })
      
      await cache.put(
        `${location.origin}/haven/v/range-test`,
        new Response(blob, {
          headers: { 'Content-Type': 'video/mp4' },
        })
      )
    })
    
    // Fetch with Range header
    const result = await page.evaluate(async () => {
      const res = await fetch('/haven/v/range-test', {
        headers: { Range: 'bytes=0-99' },
      })
      
      return {
        status: res.status,
        contentRange: res.headers.get('Content-Range'),
        contentLength: res.headers.get('Content-Length'),
        size: (await res.blob()).size,
      }
    })
    
    expect(result.status).toBe(206)
    expect(result.contentRange).toBe('bytes 0-99/1000')
    expect(result.size).toBe(100)
    
    // Cleanup
    await page.evaluate(async () => {
      const cache = await caches.open('haven-video-cache-v1')
      await cache.delete(`${location.origin}/haven/v/range-test`)
    })
  })
})
```

## Acceptance Criteria

- [ ] Manual test plan document is complete and covers all scenarios
- [ ] Automated Playwright tests pass for SW registration
- [ ] Automated tests verify SW intercepts `/haven/v/*` and passes through other requests
- [ ] Automated tests verify Cache API round-trip (store → retrieve)
- [ ] Automated tests verify Range request handling (206 Partial Content)
- [ ] All tests can run in CI (Playwright with headed Chrome)
- [ ] Test cleanup: cached data is removed after each test

## Dependencies

- Task 1.1 (Service Worker Setup)
- Task 1.2 (Cache API Wrapper)
- Task 1.3 (`useVideoCache` Hook)
- Task 1.4 (Next.js Configuration)

## Estimated Effort

Medium (4-6 hours)