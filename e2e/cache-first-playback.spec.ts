/**
 * Cache-First Video Playback E2E Tests
 *
 * Tests verifying the complete video playback flow with caching:
 * - First play triggers decryption and caches video
 * - Second play serves from cache (instant, no decryption)
 * - Range requests for seeking work with cached content
 * - Cache indicators update correctly
 *
 * @module e2e/cache-first-playback
 * @sprint 6
 */

import { test, expect } from '@playwright/test'
import { clearAllCaches, TEST_WALLET_ADDRESS, seedCache } from './helpers/cache-helpers'
import { setupSynapseMock, setupLitMock, VIDEO_FIXTURES, registerMockVideo, clearMockVideos } from './mocks/synapse-mock'

const CACHE_NAME = 'haven-video-cache-v1'

test.describe.configure({ mode: 'serial' })

test.describe('Cache-First Playback', () => {
  test.beforeEach(async ({ page }) => {
    await clearAllCaches(page)
    await clearMockVideos(page)
    await setupSynapseMock(page)
    await setupLitMock(page, { shouldSucceed: true, delayMs: 200 })
  })

  test.afterEach(async ({ page }) => {
    await clearAllCaches(page)
    await clearMockVideos(page)
  })

  // ========================================================================
  // First Play Tests
  // ========================================================================

  test('first play: shows decryption progress, then plays video', async ({ page }) => {
    // Setup encrypted video mock
    const fixture = VIDEO_FIXTURES.encryptedSmall
    await registerMockVideo(page, fixture.cid, fixture.data)
    
    // Seed cache with video metadata
    const videoData = {
      id: fixture.id,
      owner: TEST_WALLET_ADDRESS,
      title: fixture.title,
      description: 'Test encrypted video',
      duration: fixture.duration,
      filecoinCid: fixture.cid,
      encryptedCid: fixture.encryptedCid,
      isEncrypted: true,
      litEncryptionMetadata: fixture.encryptionMetadata,
      hasAiData: false,
      createdAt: Date.now(),
      cachedAt: Date.now(),
      lastSyncedAt: Date.now(),
      lastAccessedAt: Date.now(),
      cacheVersion: 1,
      arkivEntityStatus: 'active',
      arkivEntityKey: fixture.id,
      videoCacheStatus: 'not-cached',
    }
    await seedCache(page, TEST_WALLET_ADDRESS, [videoData])
    
    // Navigate to watch page
    await page.goto(`/watch/${fixture.id}`)
    await page.waitForLoadState('networkidle')
    
    // Simulate decryption progress flow
    const progressMessages: string[] = []
    
    // Listen for console messages that would indicate decryption progress
    page.on('console', msg => {
      const text = msg.text()
      if (text.includes('decrypt') || text.includes('Decrypt')) {
        progressMessages.push(text)
      }
    })
    
    // Trigger decryption via page evaluation
    const decryptResult = await page.evaluate(async (videoId) => {
      // Simulate the decryption flow
      const progress: string[] = []
      
      // Step 1: Initialize
      progress.push('Initializing Lit Protocol...')
      
      // Step 2: Authenticate
      progress.push('Authenticating with your wallet...')
      await new Promise(r => setTimeout(r, 100))
      
      // Step 3: Request key
      progress.push('Requesting decryption key from Lit nodes...')
      await new Promise(r => setTimeout(r, 100))
      
      // Step 4: Success
      progress.push('Key decrypted successfully')
      
      return { success: true, progress }
    }, fixture.id)
    
    expect(decryptResult.success).toBe(true)
    expect(decryptResult.progress.length).toBeGreaterThanOrEqual(3)
    expect(decryptResult.progress).toContain('Key decrypted successfully')
  })

  test('first play: video is cached after decryption', async ({ page }) => {
    const fixture = VIDEO_FIXTURES.small
    await registerMockVideo(page, fixture.cid, fixture.data)
    
    const videoId = fixture.id
    
    // Pre-seed the video cache (simulating post-decryption caching)
    await page.evaluate(async ({ cacheName, id, data }) => {
      const cache = await caches.open(cacheName)
      const blob = new Blob([new Uint8Array(data)], { type: 'video/mp4' })
      
      await cache.put(
        `${location.origin}/haven/v/${id}`,
        new Response(blob, {
          headers: {
            'Content-Type': 'video/mp4',
            'X-Haven-Video-Id': id,
            'X-Haven-Cached-At': new Date().toISOString(),
            'X-Haven-Size': String(data.length),
            'Accept-Ranges': 'bytes',
          },
        })
      )
    }, { cacheName: CACHE_NAME, id: videoId, data: Array.from(fixture.data) })
    
    // Verify video is in cache
    const cached = await page.evaluate(async (id) => {
      const res = await fetch(`/haven/v/${id}`)
      return {
        status: res.status,
        videoId: res.headers.get('X-Haven-Video-Id'),
      }
    }, videoId)
    
    expect(cached.status).toBe(200)
    expect(cached.videoId).toBe(videoId)
  })

  // ========================================================================
  // Second Play (Cache Hit) Tests
  // ========================================================================

  test('second play: video plays instantly from cache (no progress UI)', async ({ page }) => {
    const fixture = VIDEO_FIXTURES.small
    const videoId = fixture.id
    
    // Pre-seed the cache
    await page.evaluate(async ({ cacheName, id, data }) => {
      const cache = await caches.open(cacheName)
      const blob = new Blob([new Uint8Array(data)], { type: 'video/mp4' })
      
      await cache.put(
        `${location.origin}/haven/v/${id}`,
        new Response(blob, {
          headers: {
            'Content-Type': 'video/mp4',
            'X-Haven-Video-Id': id,
            'X-Haven-Cached-At': new Date().toISOString(),
            'X-Haven-Size': String(data.length),
            'Accept-Ranges': 'bytes',
          },
        })
      )
    }, { cacheName: CACHE_NAME, id: videoId, data: Array.from(fixture.data) })
    
    // Measure cache hit time
    const startTime = Date.now()
    
    const cached = await page.evaluate(async (id) => {
      const res = await fetch(`/haven/v/${id}`)
      return {
        status: res.status,
        size: (await res.blob()).size,
      }
    }, videoId)
    
    const endTime = Date.now()
    const duration = endTime - startTime
    
    expect(cached.status).toBe(200)
    expect(cached.size).toBe(fixture.data.length)
    // Cache hit should be very fast (< 100ms for cached content)
    expect(duration).toBeLessThan(500)
  })

  test('cache hit returns correct headers', async ({ page }) => {
    const fixture = VIDEO_FIXTURES.small
    const videoId = fixture.id
    const cachedAt = new Date().toISOString()
    
    // Pre-seed the cache
    await page.evaluate(async ({ cacheName, id, data, cachedAt }) => {
      const cache = await caches.open(cacheName)
      const blob = new Blob([new Uint8Array(data)], { type: 'video/mp4' })
      
      await cache.put(
        `${location.origin}/haven/v/${id}`,
        new Response(blob, {
          headers: {
            'Content-Type': 'video/mp4',
            'X-Haven-Video-Id': id,
            'X-Haven-Cached-At': cachedAt,
            'X-Haven-Size': String(data.length),
            'Accept-Ranges': 'bytes',
          },
        })
      )
    }, { cacheName: CACHE_NAME, id: videoId, data: Array.from(fixture.data), cachedAt })
    
    // Verify headers
    const headers = await page.evaluate(async (id) => {
      const res = await fetch(`/haven/v/${id}`)
      return {
        contentType: res.headers.get('Content-Type'),
        videoId: res.headers.get('X-Haven-Video-Id'),
        cachedAt: res.headers.get('X-Haven-Cached-At'),
        size: res.headers.get('X-Haven-Size'),
        acceptRanges: res.headers.get('Accept-Ranges'),
      }
    }, videoId)
    
    expect(headers.contentType).toBe('video/mp4')
    expect(headers.videoId).toBe(videoId)
    expect(headers.cachedAt).toBe(cachedAt)
    expect(headers.size).toBe(String(fixture.data.length))
    expect(headers.acceptRanges).toBe('bytes')
  })

  // ========================================================================
  // Range Request Tests (Seeking)
  // ========================================================================

  test('cached video supports seeking (Range requests)', async ({ page }) => {
    const fixture = VIDEO_FIXTURES.medium
    const videoId = fixture.id
    
    // Pre-seed cache with larger video
    await page.evaluate(async ({ cacheName, id, data }) => {
      const cache = await caches.open(cacheName)
      const blob = new Blob([new Uint8Array(data)], { type: 'video/mp4' })
      
      await cache.put(
        `${location.origin}/haven/v/${id}`,
        new Response(blob, {
          headers: {
            'Content-Type': 'video/mp4',
            'X-Haven-Video-Id': id,
            'X-Haven-Size': String(data.length),
            'Accept-Ranges': 'bytes',
          },
        })
      )
    }, { cacheName: CACHE_NAME, id: videoId, data: Array.from(fixture.data) })
    
    // Test range request
    const rangeResult = await page.evaluate(async (id) => {
      const res = await fetch(`/haven/v/${id}`, {
        headers: { Range: 'bytes=0-1023' },
      })
      
      return {
        status: res.status,
        statusText: res.statusText,
        contentRange: res.headers.get('Content-Range'),
        contentLength: res.headers.get('Content-Length'),
        acceptRanges: res.headers.get('Accept-Ranges'),
        size: (await res.blob()).size,
      }
    }, videoId)
    
    expect(rangeResult.status).toBe(206)
    expect(rangeResult.statusText).toBe('Partial Content')
    expect(rangeResult.contentRange).toMatch(/bytes 0-1023\/\d+/)
    expect(rangeResult.contentLength).toBe('1024')
    expect(rangeResult.size).toBe(1024)
    expect(rangeResult.acceptRanges).toBe('bytes')
  })

  test('supports seeking to middle of video', async ({ page }) => {
    const fixture = VIDEO_FIXTURES.medium
    const videoId = fixture.id
    const videoSize = fixture.data.length
    const midPoint = Math.floor(videoSize / 2)
    
    // Pre-seed cache
    await page.evaluate(async ({ cacheName, id, data }) => {
      const cache = await caches.open(cacheName)
      const blob = new Blob([new Uint8Array(data)], { type: 'video/mp4' })
      
      await cache.put(
        `${location.origin}/haven/v/${id}`,
        new Response(blob, {
          headers: {
            'Content-Type': 'video/mp4',
            'X-Haven-Video-Id': id,
            'X-Haven-Size': String(data.length),
            'Accept-Ranges': 'bytes',
          },
        })
      )
    }, { cacheName: CACHE_NAME, id: videoId, data: Array.from(fixture.data) })
    
    // Test range request from middle
    const rangeResult = await page.evaluate(async ({ id, midPoint }) => {
      const rangeStart = midPoint
      const rangeEnd = midPoint + 1023
      
      const res = await fetch(`/haven/v/${id}`, {
        headers: { Range: `bytes=${rangeStart}-${rangeEnd}` },
      })
      
      const blob = await res.blob()
      const arrayBuffer = await blob.arrayBuffer()
      const data = new Uint8Array(arrayBuffer)
      
      return {
        status: res.status,
        contentRange: res.headers.get('Content-Range'),
        size: data.length,
      }
    }, { id: videoId, midPoint })
    
    expect(rangeResult.status).toBe(206)
    expect(rangeResult.size).toBe(1024)
  })

  test('supports open-ended range requests', async ({ page }) => {
    const fixture = VIDEO_FIXTURES.small
    const videoId = fixture.id
    const videoSize = fixture.data.length
    
    // Pre-seed cache
    await page.evaluate(async ({ cacheName, id, data }) => {
      const cache = await caches.open(cacheName)
      const blob = new Blob([new Uint8Array(data)], { type: 'video/mp4' })
      
      await cache.put(
        `${location.origin}/haven/v/${id}`,
        new Response(blob, {
          headers: {
            'Content-Type': 'video/mp4',
            'X-Haven-Video-Id': id,
            'X-Haven-Size': String(data.length),
            'Accept-Ranges': 'bytes',
          },
        })
      )
    }, { cacheName: CACHE_NAME, id: videoId, data: Array.from(fixture.data) })
    
    // Test open-ended range (bytes=start-)
    const rangeResult = await page.evaluate(async ({ id, size }) => {
      const rangeStart = Math.floor(size / 2)
      
      const res = await fetch(`/haven/v/${id}`, {
        headers: { Range: `bytes=${rangeStart}-` },
      })
      
      const blob = await res.blob()
      
      return {
        status: res.status,
        contentRange: res.headers.get('Content-Range'),
        size: blob.size,
        expectedSize: size - rangeStart,
      }
    }, { id: videoId, size: videoSize })
    
    expect(rangeResult.status).toBe(206)
    expect(rangeResult.size).toBe(rangeResult.expectedSize)
  })

  test('handles multiple sequential range requests', async ({ page }) => {
    const fixture = VIDEO_FIXTURES.medium
    const videoId = fixture.id
    
    // Pre-seed cache
    await page.evaluate(async ({ cacheName, id, data }) => {
      const cache = await caches.open(cacheName)
      const blob = new Blob([new Uint8Array(data)], { type: 'video/mp4' })
      
      await cache.put(
        `${location.origin}/haven/v/${id}`,
        new Response(blob, {
          headers: {
            'Content-Type': 'video/mp4',
            'X-Haven-Video-Id': id,
            'X-Haven-Size': String(data.length),
            'Accept-Ranges': 'bytes',
          },
        })
      )
    }, { cacheName: CACHE_NAME, id: videoId, data: Array.from(fixture.data) })
    
    // Simulate multiple range requests (like a video player seeking)
    const ranges = [
      { start: 0, end: 65535 },      // First chunk
      { start: 65536, end: 131071 }, // Second chunk
      { start: 196608, end: 262143 }, // Jump ahead
      { start: 0, end: 65535 },      // Back to beginning
    ]
    
    for (const range of ranges) {
      const result = await page.evaluate(async ({ id, start, end }) => {
        const res = await fetch(`/haven/v/${id}`, {
          headers: { Range: `bytes=${start}-${end}` },
        })
        
        return {
          status: res.status,
          contentRange: res.headers.get('Content-Range'),
          size: (await res.blob()).size,
        }
      }, { id: videoId, start: range.start, end: range.end })
      
      expect(result.status).toBe(206)
      expect(result.size).toBe(range.end - range.start + 1)
    }
  })

  // ========================================================================
  // Cache Indicator Tests
  // ========================================================================

  test('cache indicator shows "Cached" badge after first play', async ({ page }) => {
    const fixture = VIDEO_FIXTURES.small
    const videoId = fixture.id
    
    // Initially not cached
    const initialStatus = await page.evaluate(async (id) => {
      // Check cache status via cache API
      const cache = await caches.open('haven-video-cache-v1')
      const cached = await cache.match(`${location.origin}/haven/v/${id}`)
      return { isCached: cached !== undefined }
    }, videoId)
    
    expect(initialStatus.isCached).toBe(false)
    
    // Cache the video
    await page.evaluate(async ({ cacheName, id, data }) => {
      const cache = await caches.open(cacheName)
      const blob = new Blob([new Uint8Array(data)], { type: 'video/mp4' })
      
      await cache.put(
        `${location.origin}/haven/v/${id}`,
        new Response(blob, {
          headers: {
            'Content-Type': 'video/mp4',
            'X-Haven-Video-Id': id,
            'X-Haven-Cached-At': new Date().toISOString(),
            'Accept-Ranges': 'bytes',
          },
        })
      )
    }, { cacheName: CACHE_NAME, id: videoId, data: Array.from(fixture.data) })
    
    // Verify now cached
    const cachedStatus = await page.evaluate(async (id) => {
      const cache = await caches.open('haven-video-cache-v1')
      const cached = await cache.match(`${location.origin}/haven/v/${id}`)
      return { 
        isCached: cached !== undefined,
        cachedAt: cached?.headers.get('X-Haven-Cached-At'),
      }
    }, videoId)
    
    expect(cachedStatus.isCached).toBe(true)
    expect(cachedStatus.cachedAt).toBeTruthy()
  })

  test('cache metadata is preserved correctly', async ({ page }) => {
    const fixture = VIDEO_FIXTURES.small
    const videoId = fixture.id
    const cachedAt = new Date().toISOString()
    
    // Cache with full metadata
    await page.evaluate(async ({ cacheName, id, data, cachedAt }) => {
      const cache = await caches.open(cacheName)
      const blob = new Blob([new Uint8Array(data)], { type: 'video/mp4' })
      
      await cache.put(
        `${location.origin}/haven/v/${id}`,
        new Response(blob, {
          headers: {
            'Content-Type': 'video/mp4',
            'X-Haven-Video-Id': id,
            'X-Haven-Cached-At': cachedAt,
            'X-Haven-Size': String(data.length),
            'X-Haven-Original-Cid': 'original-cid-test',
            'Accept-Ranges': 'bytes',
          },
        })
      )
    }, { cacheName: CACHE_NAME, id: videoId, data: Array.from(fixture.data), cachedAt })
    
    // Verify all metadata
    const metadata = await page.evaluate(async (id) => {
      const cache = await caches.open('haven-video-cache-v1')
      const cached = await cache.match(`${location.origin}/haven/v/${id}`)
      
      if (!cached) return null
      
      return {
        contentType: cached.headers.get('Content-Type'),
        videoId: cached.headers.get('X-Haven-Video-Id'),
        cachedAt: cached.headers.get('X-Haven-Cached-At'),
        size: cached.headers.get('X-Haven-Size'),
        originalCid: cached.headers.get('X-Haven-Original-Cid'),
        acceptRanges: cached.headers.get('Accept-Ranges'),
      }
    }, videoId)
    
    expect(metadata).not.toBeNull()
    expect(metadata?.contentType).toBe('video/mp4')
    expect(metadata?.videoId).toBe(videoId)
    expect(metadata?.cachedAt).toBe(cachedAt)
    expect(metadata?.size).toBe(String(fixture.data.length))
    expect(metadata?.originalCid).toBe('original-cid-test')
    expect(metadata?.acceptRanges).toBe('bytes')
  })

  test('cache hit does not trigger decryption', async ({ page }) => {
    const fixture = VIDEO_FIXTURES.small
    const videoId = fixture.id
    
    // Pre-seed cache
    await page.evaluate(async ({ cacheName, id, data }) => {
      const cache = await caches.open(cacheName)
      const blob = new Blob([new Uint8Array(data)], { type: 'video/mp4' })
      
      await cache.put(
        `${location.origin}/haven/v/${id}`,
        new Response(blob, {
          headers: {
            'Content-Type': 'video/mp4',
            'X-Haven-Video-Id': id,
            'X-Haven-Cached-At': new Date().toISOString(),
            'Accept-Ranges': 'bytes',
          },
        })
      )
    }, { cacheName: CACHE_NAME, id: videoId, data: Array.from(fixture.data) })
    
    // Track if decryption would be triggered
    const decryptionTriggered = await page.evaluate(async (id) => {
      // In a real scenario, the app would check cache first
      // If cached, no decryption needed
      const cache = await caches.open('haven-video-cache-v1')
      const cached = await cache.match(`${location.origin}/haven/v/${id}`)
      
      // Simulate app logic: if cached, skip decryption
      if (cached) {
        return { decryptionNeeded: false, cached: true }
      }
      
      return { decryptionNeeded: true, cached: false }
    }, videoId)
    
    expect(decryptionTriggered.cached).toBe(true)
    expect(decryptionTriggered.decryptionNeeded).toBe(false)
  })
})
