/**
 * Video Cache Pipeline E2E Tests
 *
 * End-to-end tests validating the full Service Worker + Cache API + useVideoCache
 * pipeline. These tests ensure all Sprint 1 components work together correctly.
 *
 * Tests cover:
 * - Service Worker registration and activation
 * - SW request interception for /haven/v/* paths
 * - Cache API round-trip (store → retrieve → delete)
 * - Range request handling (206 Partial Content)
 * - Pass-through behavior for non-haven requests
 *
 * @module e2e/video-cache
 * @see ../docs/MANUAL_TEST_PLAN.md - Manual testing companion
 */

import { test, expect } from '@playwright/test'

// ============================================================================
// Constants
// ============================================================================

const CACHE_NAME = 'haven-video-cache-v1'
const VIDEO_URL_PREFIX = '/haven/v/'

// ============================================================================
// Test Setup & Cleanup
// ============================================================================

/**
 * Clear all video cache data before and after each test
 */
async function clearVideoCache(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(async (cacheName) => {
    // Delete the Cache API cache
    await caches.delete(cacheName)
    
    // Also clear any orphaned cache entries
    const allCaches = await caches.keys()
    for (const name of allCaches) {
      if (name.startsWith('haven-video-cache-')) {
        await caches.delete(name)
      }
    }
  }, CACHE_NAME)
}

test.beforeEach(async ({ page }) => {
  await clearVideoCache(page)
})

test.afterEach(async ({ page }) => {
  await clearVideoCache(page)
})

// ============================================================================
// Test Suite: Video Cache Pipeline
// ============================================================================

test.describe('Video Cache Pipeline', () => {
  
  // ========================================================================
  // Test 1: Service Worker Registration
  // ========================================================================
  
  test('Service Worker registers successfully', async ({ page }) => {
    await page.goto('/')
    
    // Wait for SW to register and be ready
    const swReady = await page.evaluate(async () => {
      // Wait for service worker to be ready
      const reg = await navigator.serviceWorker.ready
      return reg.active?.state === 'activated'
    })
    
    expect(swReady).toBe(true)
  })
  
  test('Service Worker has correct scope and script URL', async ({ page }) => {
    await page.goto('/')
    
    const swInfo = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready
      return {
        scope: reg.scope,
        scriptURL: reg.active?.scriptURL,
        state: reg.active?.state,
      }
    })
    
    expect(swInfo.state).toBe('activated')
    expect(swInfo.scriptURL).toContain('haven-sw.js')
    // Scope should be the origin root
    expect(swInfo.scope).toMatch(/^https?:\/\/[^/]+\/$/)
  })
  
  // ========================================================================
  // Test 2: SW Request Interception
  // ========================================================================
  
  test('SW intercepts /haven/v/* requests', async ({ page }) => {
    await page.goto('/')
    
    // Wait for SW to be ready
    await page.evaluate(() => navigator.serviceWorker.ready)
    
    // Request a non-cached video — should get 404 from SW
    const response = await page.evaluate(async (prefix) => {
      const res = await fetch(`${prefix}test-nonexistent`)
      return { 
        status: res.status, 
        statusText: res.statusText,
        body: await res.text() 
      }
    }, VIDEO_URL_PREFIX)
    
    expect(response.status).toBe(404)
    expect(response.body).toContain('Video not found in cache')
  })
  
  test('SW passes through non-haven requests', async ({ page }) => {
    await page.goto('/')
    
    // Regular page navigation should work normally
    const response = await page.goto('/library')
    expect(response?.status()).toBe(200)
    
    // Verify page content loaded (not intercepted by SW)
    const pageTitle = await page.locator('h1, [data-testid="page-title"]').first().textContent()
    expect(pageTitle?.length).toBeGreaterThan(0)
  })
  
  test('SW does not intercept API requests', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => navigator.serviceWorker.ready)
    
    // Mock an API request - should not be handled by SW
    // We'll check by making a request that would 404 but NOT through SW
    const response = await page.evaluate(async () => {
      const res = await fetch('/api/test-endpoint-that-does-not-exist')
      return {
        status: res.status,
        // If SW intercepted, we'd see "Video not found in cache"
        // If passed through, we see Next.js 404 page
        contentType: res.headers.get('Content-Type'),
      }
    })
    
    // Should get 404 from Next.js, not from SW
    expect(response.status).toBe(404)
    // Response should NOT be the SW's text response
    expect(response.contentType).not.toBe('text/plain')
  })
  
  // ========================================================================
  // Test 3: Cache API Operations
  // ========================================================================
  
  test('Cache API wrapper stores and retrieves video', async ({ page }) => {
    await page.goto('/')
    
    const result = await page.evaluate(async (cacheName) => {
      const cache = await caches.open(cacheName)
      const testData = new Uint8Array([1, 2, 3, 4, 5])
      const blob = new Blob([testData], { type: 'video/mp4' })
      
      const url = `${location.origin}/haven/v/test-video-123`
      const cachedAt = new Date().toISOString()
      
      await cache.put(url, new Response(blob, {
        headers: {
          'Content-Type': 'video/mp4',
          'X-Haven-Video-Id': 'test-video-123',
          'X-Haven-Cached-At': cachedAt,
          'X-Haven-Size': String(testData.length),
          'Accept-Ranges': 'bytes',
        },
      }))
      
      // Retrieve
      const cached = await cache.match(url)
      if (!cached) return { found: false }
      
      const buffer = await cached.blob().then((b: Blob) => b.arrayBuffer())
      const data = new Uint8Array(buffer)
      
      // Cleanup
      await cache.delete(url)
      
      return {
        found: true,
        size: data.length,
        contentType: cached.headers.get('Content-Type'),
        videoId: cached.headers.get('X-Haven-Video-Id'),
        cachedAt: cached.headers.get('X-Haven-Cache-At'),
        havenSize: cached.headers.get('X-Haven-Size'),
        acceptRanges: cached.headers.get('Accept-Ranges'),
        dataMatches: data.every((val: number, i: number) => val === testData[i]),
      }
    }, CACHE_NAME)
    
    expect(result.found).toBe(true)
    expect(result.size).toBe(5)
    expect(result.contentType).toBe('video/mp4')
    expect(result.videoId).toBe('test-video-123')
    expect(result.havenSize).toBe('5')
    expect(result.acceptRanges).toBe('bytes')
    expect(result.dataMatches).toBe(true)
  })
  
  test('Cache API stores multiple videos independently', async ({ page }) => {
    await page.goto('/')
    
    const result = await page.evaluate(async (cacheName) => {
      const cache = await caches.open(cacheName)
      const videos = [
        { id: 'video-1', data: [1, 2, 3], type: 'video/mp4' },
        { id: 'video-2', data: [4, 5, 6], type: 'video/webm' },
        { id: 'video-3', data: [7, 8, 9], type: 'video/mp4' },
      ]
      
      // Store all videos
      for (const video of videos) {
        const blob = new Blob([new Uint8Array(video.data)], { type: video.type })
        const url = `${location.origin}/haven/v/${video.id}`
        await cache.put(url, new Response(blob, {
          headers: {
            'Content-Type': video.type,
            'X-Haven-Video-Id': video.id,
            'X-Haven-Size': String(video.data.length),
          },
        }))
      }
      
      // Retrieve and verify all
      const results = []
      for (const video of videos) {
        const url = `${location.origin}/haven/v/${video.id}`
        const cached = await cache.match(url)
        if (cached) {
          const buffer = await cached.blob().then((b: Blob) => b.arrayBuffer())
          const data = new Uint8Array(buffer)
          results.push({
            id: video.id,
            found: true,
            size: data.length,
            contentType: cached.headers.get('Content-Type'),
            dataMatches: data.every((val, i) => val === video.data[i]),
          })
        } else {
          results.push({ id: video.id, found: false })
        }
      }
      
      // Cleanup
      for (const video of videos) {
        await cache.delete(`${location.origin}/haven/v/${video.id}`)
      }
      
      return results
    }, CACHE_NAME)
    
    expect(result).toHaveLength(3)
    expect(result.every(r => r.found)).toBe(true)
    expect(result.every(r => r.dataMatches)).toBe(true)
  })
  
  test('Cache API delete removes video from cache', async ({ page }) => {
    await page.goto('/')
    
    const result = await page.evaluate(async (cacheName) => {
      const cache = await caches.open(cacheName)
      const url = `${location.origin}/haven/v/delete-test-video`
      
      // Store video
      const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'video/mp4' })
      await cache.put(url, new Response(blob, {
        headers: { 'Content-Type': 'video/mp4' },
      }))
      
      // Verify it exists
      const beforeDelete = await cache.match(url)
      const existedBefore = beforeDelete !== undefined
      
      // Delete it
      await cache.delete(url)
      
      // Verify it's gone
      const afterDelete = await cache.match(url)
      const existsAfter = afterDelete !== undefined
      
      return { existedBefore, existsAfter }
    }, CACHE_NAME)
    
    expect(result.existedBefore).toBe(true)
    expect(result.existsAfter).toBe(false)
  })
  
  // ========================================================================
  // Test 4: Range Request Handling
  // ========================================================================
  
  test('SW serves cached video with Range request support', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => navigator.serviceWorker.ready)
    
    // Store a test video in cache
    await page.evaluate(async (cacheName) => {
      const cache = await caches.open(cacheName)
      const testData = new Uint8Array(1000).fill(42)
      const blob = new Blob([testData], { type: 'video/mp4' })
      
      await cache.put(
        `${location.origin}/haven/v/range-test`,
        new Response(blob, {
          headers: { 
            'Content-Type': 'video/mp4',
            'Accept-Ranges': 'bytes',
          },
        })
      )
    }, CACHE_NAME)
    
    // Fetch with Range header
    const result = await page.evaluate(async () => {
      const res = await fetch('/haven/v/range-test', {
        headers: { Range: 'bytes=0-99' },
      })
      
      return {
        status: res.status,
        statusText: res.statusText,
        contentRange: res.headers.get('Content-Range'),
        contentLength: res.headers.get('Content-Length'),
        acceptRanges: res.headers.get('Accept-Ranges'),
        size: (await res.blob()).size,
      }
    })
    
    expect(result.status).toBe(206)
    expect(result.statusText).toBe('Partial Content')
    expect(result.contentRange).toBe('bytes 0-99/1000')
    expect(result.contentLength).toBe('100')
    expect(result.size).toBe(100)
    expect(result.acceptRanges).toBe('bytes')
    
    // Cleanup
    await page.evaluate(async (cacheName) => {
      const cache = await caches.open(cacheName)
      await cache.delete(`${location.origin}/haven/v/range-test`)
    }, CACHE_NAME)
  })
  
  test('SW handles Range request at middle of video', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => navigator.serviceWorker.ready)
    
    // Store test video
    await page.evaluate(async (cacheName) => {
      const cache = await caches.open(cacheName)
      const testData = new Uint8Array(5000).fill(0).map((_, i) => i % 256)
      const blob = new Blob([testData], { type: 'video/mp4' })
      
      await cache.put(
        `${location.origin}/haven/v/range-test-mid`,
        new Response(blob, {
          headers: { 
            'Content-Type': 'video/mp4',
            'Accept-Ranges': 'bytes',
          },
        })
      )
    }, CACHE_NAME)
    
    // Request bytes 1000-1999
    const result = await page.evaluate(async () => {
      const res = await fetch('/haven/v/range-test-mid', {
        headers: { Range: 'bytes=1000-1999' },
      })
      
      const blob = await res.blob()
      const buffer = await blob.arrayBuffer()
      const data = Array.from(new Uint8Array(buffer))
      
      return {
        status: res.status,
        contentRange: res.headers.get('Content-Range'),
        size: data.length,
        // First byte should be 1000 % 256 = 232
        firstByte: data[0] ?? 0,
        // Last byte should be 1999 % 256 = 207
        lastByte: data[data.length - 1] ?? 0,
      }
    })
    
    expect(result.status).toBe(206)
    expect(result.contentRange).toBe('bytes 1000-1999/5000')
    expect(result.size).toBe(1000)
    expect(result.firstByte).toBe(1000 % 256)
    expect(result.lastByte).toBe(1999 % 256)
    
    // Cleanup
    await page.evaluate(async (cacheName) => {
      const cache = await caches.open(cacheName)
      await cache.delete(`${location.origin}/haven/v/range-test-mid`)
    }, CACHE_NAME)
  })
  
  test('SW handles open-ended Range request', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => navigator.serviceWorker.ready)
    
    // Store test video
    await page.evaluate(async (cacheName) => {
      const cache = await caches.open(cacheName)
      const testData = new Uint8Array(1000).fill(42)
      const blob = new Blob([testData], { type: 'video/mp4' })
      
      await cache.put(
        `${location.origin}/haven/v/range-test-open`,
        new Response(blob, {
          headers: { 
            'Content-Type': 'video/mp4',
            'Accept-Ranges': 'bytes',
          },
        })
      )
    }, CACHE_NAME)
    
    // Request bytes 500 to end (no end byte specified)
    const result = await page.evaluate(async () => {
      const res = await fetch('/haven/v/range-test-open', {
        headers: { Range: 'bytes=500-' },
      })
      
      return {
        status: res.status,
        contentRange: res.headers.get('Content-Range'),
        size: (await res.blob()).size,
      }
    })
    
    expect(result.status).toBe(206)
    // Should return bytes 500-999 (500 bytes)
    expect(result.contentRange).toBe('bytes 500-999/1000')
    expect(result.size).toBe(500)
    
    // Cleanup
    await page.evaluate(async (cacheName) => {
      const cache = await caches.open(cacheName)
      await cache.delete(`${location.origin}/haven/v/range-test-open`)
    }, CACHE_NAME)
  })
  
  test('SW returns 416 for invalid Range request', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => navigator.serviceWorker.ready)
    
    // Store test video
    await page.evaluate(async (cacheName) => {
      const cache = await caches.open(cacheName)
      const testData = new Uint8Array(1000).fill(42)
      const blob = new Blob([testData], { type: 'video/mp4' })
      
      await cache.put(
        `${location.origin}/haven/v/range-test-invalid`,
        new Response(blob, {
          headers: { 
            'Content-Type': 'video/mp4',
            'Accept-Ranges': 'bytes',
          },
        })
      )
    }, CACHE_NAME)
    
    // Request range beyond file size
    const result = await page.evaluate(async () => {
      const res = await fetch('/haven/v/range-test-invalid', {
        headers: { Range: 'bytes=2000-3000' }, // Beyond 1000 byte file
      })
      
      return {
        status: res.status,
        contentRange: res.headers.get('Content-Range'),
      }
    })
    
    expect(result.status).toBe(416)
    expect(result.contentRange).toBe('bytes */1000')
    
    // Cleanup
    await page.evaluate(async (cacheName) => {
      const cache = await caches.open(cacheName)
      await cache.delete(`${location.origin}/haven/v/range-test-invalid`)
    }, CACHE_NAME)
  })
  
  // ========================================================================
  // Test 5: Full Pipeline Integration
  // ========================================================================
  
  test('full pipeline: cache miss followed by cache hit', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => navigator.serviceWorker.ready)
    
    const videoId = 'pipeline-test-video'
    
    // Step 1: Verify cache miss (404)
    const missResult = await page.evaluate(async (id) => {
      const res = await fetch(`/haven/v/${id}`)
      return { status: res.status }
    }, videoId)
    
    expect(missResult.status).toBe(404)
    
    // Step 2: Store video in cache (simulating successful decrypt + cache)
    await page.evaluate(async ({ cacheName, id }) => {
      const cache = await caches.open(cacheName)
      const testData = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
      const blob = new Blob([testData], { type: 'video/mp4' })
      
      await cache.put(
        `${location.origin}/haven/v/${id}`,
        new Response(blob, {
          headers: {
            'Content-Type': 'video/mp4',
            'X-Haven-Video-Id': id,
            'X-Haven-Cached-At': new Date().toISOString(),
            'X-Haven-Size': String(testData.length),
            'Accept-Ranges': 'bytes',
          },
        })
      )
    }, { cacheName: CACHE_NAME, id: videoId })
    
    // Step 3: Verify cache hit (200)
    const hitResult = await page.evaluate(async (id) => {
      const res = await fetch(`/haven/v/${id}`)
      const data = new Uint8Array(await res.arrayBuffer())
      
      return {
        status: res.status,
        contentType: res.headers.get('Content-Type'),
        videoId: res.headers.get('X-Haven-Video-Id'),
        size: data.length,
      }
    }, videoId)
    
    expect(hitResult.status).toBe(200)
    expect(hitResult.contentType).toBe('video/mp4')
    expect(hitResult.videoId).toBe(videoId)
    expect(hitResult.size).toBe(10)
  })
  
  test('cache entries persist across page reloads', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => navigator.serviceWorker.ready)
    
    const videoId = 'persist-test-video'
    
    // Store video
    await page.evaluate(async ({ cacheName, id }) => {
      const cache = await caches.open(cacheName)
      const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'video/mp4' })
      
      await cache.put(
        `${location.origin}/haven/v/${id}`,
        new Response(blob, {
          headers: {
            'Content-Type': 'video/mp4',
            'X-Haven-Video-Id': id,
          },
        })
      )
    }, { cacheName: CACHE_NAME, id: videoId })
    
    // Reload page
    await page.reload()
    await page.evaluate(() => navigator.serviceWorker.ready)
    
    // Verify video still in cache
    const result = await page.evaluate(async (id) => {
      const res = await fetch(`/haven/v/${id}`)
      return {
        status: res.status,
        videoId: res.headers.get('X-Haven-Video-Id'),
      }
    }, videoId)
    
    expect(result.status).toBe(200)
    expect(result.videoId).toBe(videoId)
  })
})

// ============================================================================
// Test Suite: Cache API Edge Cases
// ============================================================================

test.describe('Video Cache Edge Cases', () => {
  
  test.beforeEach(async ({ page }) => {
    await clearVideoCache(page)
  })
  
  test.afterEach(async ({ page }) => {
    await clearVideoCache(page)
  })
  
  test('handles empty video data', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => navigator.serviceWorker.ready)
    
    const result = await page.evaluate(async (cacheName) => {
      const cache = await caches.open(cacheName)
      const blob = new Blob([], { type: 'video/mp4' })
      
      await cache.put(
        `${location.origin}/haven/v/empty-video`,
        new Response(blob, {
          headers: {
            'Content-Type': 'video/mp4',
            'X-Haven-Size': '0',
          },
        })
      )
      
      const res = await fetch('/haven/v/empty-video')
      return {
        status: res.status,
        size: (await res.blob()).size,
      }
    }, CACHE_NAME)
    
    expect(result.status).toBe(200)
    expect(result.size).toBe(0)
  })
  
  test('handles large video data', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => navigator.serviceWorker.ready)
    
    const result = await page.evaluate(async (cacheName) => {
      const cache = await caches.open(cacheName)
      // 1MB of data
      const testData = new Uint8Array(1024 * 1024).fill(42)
      const blob = new Blob([testData], { type: 'video/mp4' })
      
      await cache.put(
        `${location.origin}/haven/v/large-video`,
        new Response(blob, {
          headers: {
            'Content-Type': 'video/mp4',
            'X-Haven-Size': String(testData.length),
          },
        })
      )
      
      const res = await fetch('/haven/v/large-video')
      return {
        status: res.status,
        size: (await res.blob()).size,
      }
    }, CACHE_NAME)
    
    expect(result.status).toBe(200)
    expect(result.size).toBe(1024 * 1024)
  })
  
  test('handles video IDs with special characters', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => navigator.serviceWorker.ready)
    
    const specialIds = ['video-123', 'video_123', 'video.123', '0x123abc', 'video%20test']
    
    for (const videoId of specialIds) {
      // Store
      await page.evaluate(async ({ cacheName, id }) => {
        const cache = await caches.open(cacheName)
        const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'video/mp4' })
        
        await cache.put(
          `${location.origin}/haven/v/${id}`,
          new Response(blob, {
            headers: { 'Content-Type': 'video/mp4' },
          })
        )
      }, { cacheName: CACHE_NAME, id: videoId })
      
      // Retrieve
      const result = await page.evaluate(async (id) => {
        const res = await fetch(`/haven/v/${id}`)
        return { status: res.status }
      }, videoId)
      
      expect(result.status).toBe(200)
      
      // Cleanup
      await page.evaluate(async ({ cacheName, id }) => {
        const cache = await caches.open(cacheName)
        await cache.delete(`${location.origin}/haven/v/${id}`)
      }, { cacheName: CACHE_NAME, id: videoId })
    }
  })
  
  test('handles concurrent range requests', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => navigator.serviceWorker.ready)
    
    const result = await page.evaluate(async (cacheName) => {
      const cache = await caches.open(cacheName)
      const testData = new Uint8Array(1000).fill(0).map((_, i) => i % 256)
      const blob = new Blob([testData], { type: 'video/mp4' })
      
      await cache.put(
        `${location.origin}/haven/v/concurrent-test`,
        new Response(blob, {
          headers: { 
            'Content-Type': 'video/mp4',
            'Accept-Ranges': 'bytes',
          },
        })
      )
      
      // Make multiple concurrent range requests
      const requests = [
        fetch('/haven/v/concurrent-test', { headers: { Range: 'bytes=0-99' } }),
        fetch('/haven/v/concurrent-test', { headers: { Range: 'bytes=100-199' } }),
        fetch('/haven/v/concurrent-test', { headers: { Range: 'bytes=200-299' } }),
        fetch('/haven/v/concurrent-test', { headers: { Range: 'bytes=300-399' } }),
      ]
      
      const responses = await Promise.all(requests)
      
      // Verify all succeeded
      const results = await Promise.all(
        responses.map(async (res, i) => ({
          index: i,
          status: res.status,
          contentRange: res.headers.get('Content-Range'),
          size: (await res.blob()).size,
        }))
      )
      
      // Cleanup
      await cache.delete(`${location.origin}/haven/v/concurrent-test`)
      
      return results
    }, CACHE_NAME)
    
    expect(result).toHaveLength(4)
    expect(result.every(r => r.status === 206)).toBe(true)
    expect(result.every(r => r.size === 100)).toBe(true)
    expect(result[0].contentRange).toBe('bytes 0-99/1000')
    expect(result[1].contentRange).toBe('bytes 100-199/1000')
    expect(result[2].contentRange).toBe('bytes 200-299/1000')
    expect(result[3].contentRange).toBe('bytes 300-399/1000')
  })
})
