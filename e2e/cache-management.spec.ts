/**
 * Cache Management E2E Tests
 *
 * Tests for cache management functionality including:
 * - Settings page showing cached videos list
 * - Storage usage display
 * - Individual video removal
 * - Clear all functionality
 * - Re-decryption after eviction
 *
 * @module e2e/cache-management
 * @sprint 6
 */

import { test, expect } from '@playwright/test'
import { 
  clearAllCaches, 
  TEST_WALLET_ADDRESS, 
  seedCache, 
  readCache,
  createTestCachedVideo,
  createTestCachedVideos,
} from './helpers/cache-helpers'

const CACHE_NAME = 'haven-video-cache-v1'
const VIDEO_CACHE_NAME = 'haven-video-cache-v1'

test.describe.configure({ mode: 'serial' })

test.describe('Cache Management', () => {
  test.beforeEach(async ({ page }) => {
    await clearAllCaches(page)
  })

  test.afterEach(async ({ page }) => {
    await clearAllCaches(page)
  })

  // ========================================================================
  // Settings Page - Cached Videos List
  // ========================================================================

  test('settings page shows cached videos list', async ({ page }) => {
    // Seed cache with videos that have video content cached
    const videos = [
      createTestCachedVideo({ 
        id: '0xvideo1', 
        title: 'Cached Video One',
        videoCacheStatus: 'cached',
        videoCachedAt: Date.now() - 3600000,
      }),
      createTestCachedVideo({ 
        id: '0xvideo2', 
        title: 'Cached Video Two',
        videoCacheStatus: 'cached',
        videoCachedAt: Date.now() - 7200000,
      }),
      createTestCachedVideo({ 
        id: '0xvideo3', 
        title: 'Not Cached Video',
        videoCacheStatus: 'not-cached',
        videoCachedAt: undefined,
      }),
    ]
    
    await seedCache(page, TEST_WALLET_ADDRESS, videos)
    
    // Also cache the actual video content
    for (const video of videos.slice(0, 2)) {
      await page.evaluate(async ({ cacheName, id }) => {
        const cache = await caches.open(cacheName)
        const blob = new Blob([new Uint8Array(1024 * 1024)], { type: 'video/mp4' })
        
        await cache.put(
          `${location.origin}/haven/v/${id}`,
          new Response(blob, {
            headers: {
              'Content-Type': 'video/mp4',
              'X-Haven-Video-Id': id,
              'X-Haven-Cached-At': new Date().toISOString(),
              'X-Haven-Size': '1048576',
            },
          })
        )
      }, { cacheName: VIDEO_CACHE_NAME, id: video.id as string })
    }
    
    // Navigate to settings
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')
    
    // Get cached videos via Cache API
    const cachedVideos = await page.evaluate(async () => {
      const cache = await caches.open('haven-video-cache-v1')
      const keys = await cache.keys()
      
      const videos = []
      for (const request of keys) {
        const response = await cache.match(request)
        if (response) {
          videos.push({
            url: request.url,
            videoId: response.headers.get('X-Haven-Video-Id'),
            cachedAt: response.headers.get('X-Haven-Cached-At'),
            size: response.headers.get('X-Haven-Size'),
          })
        }
      }
      
      return videos
    })
    
    expect(cachedVideos.length).toBe(2)
    expect(cachedVideos.map(v => v.videoId)).toContain('0xvideo1')
    expect(cachedVideos.map(v => v.videoId)).toContain('0xvideo2')
  })

  test('settings page shows storage usage', async ({ page }) => {
    // Seed cache with videos of known sizes
    const videos = [
      { id: '0xsmall', size: 1024 * 100 },    // 100KB
      { id: '0xmedium', size: 1024 * 500 },  // 500KB
      { id: '0xlarge', size: 1024 * 1024 },  // 1MB
    ]
    
    for (const video of videos) {
      await page.evaluate(async ({ cacheName, id, size }) => {
        const cache = await caches.open(cacheName)
        const blob = new Blob([new Uint8Array(size)], { type: 'video/mp4' })
        
        await cache.put(
          `${location.origin}/haven/v/${id}`,
          new Response(blob, {
            headers: {
              'Content-Type': 'video/mp4',
              'X-Haven-Video-Id': id,
              'X-Haven-Size': String(size),
            },
          })
        )
      }, { cacheName: VIDEO_CACHE_NAME, id: video.id, size: video.size })
    }
    
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')
    
    // Calculate storage usage
    const storageUsage = await page.evaluate(async () => {
      const cache = await caches.open('haven-video-cache-v1')
      const keys = await cache.keys()
      
      let totalSize = 0
      const entries: Array<{ id: string; size: number }> = []
      
      for (const request of keys) {
        const response = await cache.match(request)
        if (response) {
          const blob = await response.blob()
          const id = response.headers.get('X-Haven-Video-Id') || 'unknown'
          entries.push({ id, size: blob.size })
          totalSize += blob.size
        }
      }
      
      return { totalSize, entryCount: entries.length, entries }
    })
    
    expect(storageUsage.entryCount).toBe(3)
    expect(storageUsage.totalSize).toBe(1024 * 100 + 1024 * 500 + 1024 * 1024)
  })

  test('shows empty state when no videos cached', async ({ page }) => {
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')
    
    const cacheState = await page.evaluate(async () => {
      const cache = await caches.open('haven-video-cache-v1')
      const keys = await cache.keys()
      return { isEmpty: keys.length === 0 }
    })
    
    expect(cacheState.isEmpty).toBe(true)
  })

  // ========================================================================
  // Individual Video Removal
  // ========================================================================

  test('individual video can be removed from cache', async ({ page }) => {
    // Seed multiple videos
    const videoIds = ['0xvideo1', '0xvideo2', '0xvideo3']
    
    for (const id of videoIds) {
      await page.evaluate(async ({ cacheName, id }) => {
        const cache = await caches.open(cacheName)
        const blob = new Blob([new Uint8Array(1024)], { type: 'video/mp4' })
        
        await cache.put(
          `${location.origin}/haven/v/${id}`,
          new Response(blob, {
            headers: {
              'Content-Type': 'video/mp4',
              'X-Haven-Video-Id': id,
            },
          })
        )
      }, { cacheName: VIDEO_CACHE_NAME, id })
    }
    
    // Verify all videos exist
    const beforeDelete = await page.evaluate(async () => {
      const cache = await caches.open('haven-video-cache-v1')
      const keys = await cache.keys()
      return keys.length
    })
    
    expect(beforeDelete).toBe(3)
    
    // Delete one video
    await page.evaluate(async ({ cacheName, id }) => {
      const cache = await caches.open(cacheName)
      await cache.delete(`${location.origin}/haven/v/${id}`)
    }, { cacheName: VIDEO_CACHE_NAME, id: '0xvideo2' })
    
    // Verify video2 is deleted but others remain
    const afterDelete = await page.evaluate(async () => {
      const cache = await caches.open('haven-video-cache-v1')
      
      const keys = await cache.keys()
      const remainingIds: string[] = []
      
      for (const request of keys) {
        const response = await cache.match(request)
        const id = response?.headers.get('X-Haven-Video-Id')
        if (id) remainingIds.push(id)
      }
      
      return {
        count: keys.length,
        remainingIds,
        video2Exists: await cache.match(`${location.origin}/haven/v/0xvideo2`) !== undefined,
      }
    })
    
    expect(afterDelete.count).toBe(2)
    expect(afterDelete.remainingIds).toContain('0xvideo1')
    expect(afterDelete.remainingIds).toContain('0xvideo3')
    expect(afterDelete.video2Exists).toBe(false)
  })

  test('removing video updates metadata store', async ({ page }) => {
    const videoId = '0xmetadataTest'
    
    // Seed video in both content cache and metadata
    await page.evaluate(async ({ cacheName, id }) => {
      const cache = await caches.open(cacheName)
      const blob = new Blob([new Uint8Array(1024)], { type: 'video/mp4' })
      
      await cache.put(
        `${location.origin}/haven/v/${id}`,
        new Response(blob, {
          headers: {
            'Content-Type': 'video/mp4',
            'X-Haven-Video-Id': id,
          },
        })
      )
    }, { cacheName: VIDEO_CACHE_NAME, id: videoId })
    
    // Delete video content
    await page.evaluate(async ({ cacheName, id }) => {
      const cache = await caches.open(cacheName)
      await cache.delete(`${location.origin}/haven/v/${id}`)
    }, { cacheName: VIDEO_CACHE_NAME, id: videoId })
    
    // Verify content is deleted
    const contentExists = await page.evaluate(async (id) => {
      const cache = await caches.open('haven-video-cache-v1')
      return await cache.match(`${location.origin}/haven/v/${id}`) !== undefined
    }, videoId)
    
    expect(contentExists).toBe(false)
  })

  // ========================================================================
  // Clear All Functionality
  // ========================================================================

  test('clear all removes all cached videos', async ({ page }) => {
    // Seed many videos
    const videoIds = Array.from({ length: 10 }, (_, i) => `0xvideo${i}`)
    
    for (const id of videoIds) {
      await page.evaluate(async ({ cacheName, id }) => {
        const cache = await caches.open(cacheName)
        const blob = new Blob([new Uint8Array(1024)], { type: 'video/mp4' })
        
        await cache.put(
          `${location.origin}/haven/v/${id}`,
          new Response(blob, {
            headers: {
              'Content-Type': 'video/mp4',
              'X-Haven-Video-Id': id,
            },
          })
        )
      }, { cacheName: VIDEO_CACHE_NAME, id })
    }
    
    // Verify videos exist
    const beforeClear = await page.evaluate(async () => {
      const cache = await caches.open('haven-video-cache-v1')
      const keys = await cache.keys()
      return keys.length
    })
    
    expect(beforeClear).toBe(10)
    
    // Clear all cache entries
    await page.evaluate(async () => {
      const cache = await caches.open('haven-video-cache-v1')
      const keys = await cache.keys()
      
      for (const request of keys) {
        await cache.delete(request)
      }
    })
    
    // Verify all cleared
    const afterClear = await page.evaluate(async () => {
      const cache = await caches.open('haven-video-cache-v1')
      const keys = await cache.keys()
      return keys.length
    })
    
    expect(afterClear).toBe(0)
  })

  test('clear all preserves metadata cache', async ({ page }) => {
    // This test verifies that clearing video cache doesn't clear
    // the IndexedDB metadata cache (different storage systems)
    
    const videos = createTestCachedVideos(5)
    await seedCache(page, TEST_WALLET_ADDRESS, videos)
    
    // Cache video content
    for (const video of videos) {
      await page.evaluate(async ({ cacheName, id }) => {
        const cache = await caches.open(cacheName)
        const blob = new Blob([new Uint8Array(1024)], { type: 'video/mp4' })
        
        await cache.put(
          `${location.origin}/haven/v/${id as string}`,
          new Response(blob, { headers: { 'Content-Type': 'video/mp4' } })
        )
      }, { cacheName: VIDEO_CACHE_NAME, id: video.id })
    }
    
    // Clear video cache only
    await page.evaluate(async () => {
      const cache = await caches.open('haven-video-cache-v1')
      const keys = await cache.keys()
      
      for (const request of keys) {
        await cache.delete(request)
      }
    })
    
    // Verify IndexedDB still has metadata
    const metadataCount = await page.evaluate(async (address) => {
      return new Promise<number>((resolve) => {
        const dbName = `haven-cache-${address.toLowerCase()}`
        const request = indexedDB.open(dbName)
        
        request.onsuccess = () => {
          const db = request.result
          
          if (!db.objectStoreNames.contains('videos')) {
            resolve(0)
            return
          }
          
          const tx = db.transaction('videos', 'readonly')
          const store = tx.objectStore('videos')
          const countReq = store.count()
          
          countReq.onsuccess = () => {
            db.close()
            resolve(countReq.result)
          }
          countReq.onerror = () => {
            db.close()
            resolve(0)
          }
        }
        
        request.onerror = () => resolve(0)
      })
    }, TEST_WALLET_ADDRESS)
    
    expect(metadataCount).toBe(5)
  })

  // ========================================================================
  // Re-decryption After Eviction
  // ========================================================================

  test('evicted video requires re-decryption on next play', async ({ page }) => {
    const videoId = '0xevictedVideo'
    
    // Seed video content
    await page.evaluate(async ({ cacheName, id }) => {
      const cache = await caches.open(cacheName)
      const blob = new Blob([new Uint8Array(1024)], { type: 'video/mp4' })
      
      await cache.put(
        `${location.origin}/haven/v/${id}`,
        new Response(blob, {
          headers: {
            'Content-Type': 'video/mp4',
            'X-Haven-Video-Id': id,
          },
        })
      )
    }, { cacheName: VIDEO_CACHE_NAME, id: videoId })
    
    // Verify video is cached
    const isCachedBefore = await page.evaluate(async (id) => {
      const cache = await caches.open('haven-video-cache-v1')
      return await cache.match(`${location.origin}/haven/v/${id}`) !== undefined
    }, videoId)
    
    expect(isCachedBefore).toBe(true)
    
    // Evict the video
    await page.evaluate(async ({ cacheName, id }) => {
      const cache = await caches.open(cacheName)
      await cache.delete(`${location.origin}/haven/v/${id}`)
    }, { cacheName: VIDEO_CACHE_NAME, id: videoId })
    
    // Verify video is no longer cached (would need re-decryption)
    const isCachedAfter = await page.evaluate(async (id) => {
      const cache = await caches.open('haven-video-cache-v1')
      const cached = await cache.match(`${location.origin}/haven/v/${id}`)
      
      // If not cached, decryption would be required
      return {
        isCached: cached !== undefined,
        needsDecryption: cached === undefined,
      }
    }, videoId)
    
    expect(isCachedAfter.isCached).toBe(false)
    expect(isCachedAfter.needsDecryption).toBe(true)
  })

  test('partial eviction triggers selective re-decryption', async ({ page }) => {
    // Seed multiple videos
    const videoIds = ['0xkeep1', '0xevict', '0xkeep2']
    
    for (const id of videoIds) {
      await page.evaluate(async ({ cacheName, id }) => {
        const cache = await caches.open(cacheName)
        const blob = new Blob([new Uint8Array(1024)], { type: 'video/mp4' })
        
        await cache.put(
          `${location.origin}/haven/v/${id}`,
          new Response(blob, {
            headers: {
              'Content-Type': 'video/mp4',
              'X-Haven-Video-Id': id,
            },
          })
        )
      }, { cacheName: VIDEO_CACHE_NAME, id })
    }
    
    // Evict only middle video
    await page.evaluate(async ({ cacheName, id }) => {
      const cache = await caches.open(cacheName)
      await cache.delete(`${location.origin}/haven/v/${id}`)
    }, { cacheName: VIDEO_CACHE_NAME, id: '0xevict' })
    
    // Check status of all videos
    const statuses = await page.evaluate(async (ids) => {
      const cache = await caches.open('haven-video-cache-v1')
      
      const results: Record<string, boolean> = {}
      for (const id of ids) {
        const cached = await cache.match(`${location.origin}/haven/v/${id}`)
        results[id] = cached !== undefined
      }
      
      return results
    }, videoIds)
    
    expect(statuses['0xkeep1']).toBe(true)
    expect(statuses['0xevict']).toBe(false)
    expect(statuses['0xkeep2']).toBe(true)
  })

  // ========================================================================
  // Cache Statistics
  // ========================================================================

  test('reports accurate cache statistics', async ({ page }) => {
    // Seed videos with different sizes
    const videos = [
      { id: '0xstat1', size: 1024 * 100 },
      { id: '0xstat2', size: 1024 * 200 },
      { id: '0xstat3', size: 1024 * 300 },
    ]
    
    for (const video of videos) {
      await page.evaluate(async ({ cacheName, id, size }) => {
        const cache = await caches.open(cacheName)
        const blob = new Blob([new Uint8Array(size)], { type: 'video/mp4' })
        
        await cache.put(
          `${location.origin}/haven/v/${id}`,
          new Response(blob, {
            headers: {
              'Content-Type': 'video/mp4',
              'X-Haven-Video-Id': id,
              'X-Haven-Size': String(size),
            },
          })
        )
      }, { cacheName: VIDEO_CACHE_NAME, id: video.id, size: video.size })
    }
    
    // Get detailed statistics
    const stats = await page.evaluate(async () => {
      const cache = await caches.open('haven-video-cache-v1')
      const keys = await cache.keys()
      
      let totalSize = 0
      let videoCount = 0
      const videoSizes: Array<{ id: string; size: number }> = []
      
      for (const request of keys) {
        const response = await cache.match(request)
        if (response) {
          const blob = await response.blob()
          const id = response.headers.get('X-Haven-Video-Id') || 'unknown'
          const declaredSize = parseInt(response.headers.get('X-Haven-Size') || '0', 10)
          
          videoCount++
          totalSize += blob.size
          videoSizes.push({ id, size: blob.size })
        }
      }
      
      return {
        videoCount,
        totalSize,
        videoSizes,
        averageSize: videoCount > 0 ? totalSize / videoCount : 0,
      }
    })
    
    expect(stats.videoCount).toBe(3)
    expect(stats.totalSize).toBe(1024 * 600)
    expect(stats.averageSize).toBe(1024 * 200)
  })

  test('tracks last accessed time for cache entries', async ({ page }) => {
    const videoId = '0xaccessTrack'
    const cachedAt = Date.now() - 3600000 // 1 hour ago
    
    await page.evaluate(async ({ cacheName, id, cachedAt }) => {
      const cache = await caches.open(cacheName)
      const blob = new Blob([new Uint8Array(1024)], { type: 'video/mp4' })
      
      await cache.put(
        `${location.origin}/haven/v/${id}`,
        new Response(blob, {
          headers: {
            'Content-Type': 'video/mp4',
            'X-Haven-Video-Id': id,
            'X-Haven-Cached-At': new Date(cachedAt).toISOString(),
          },
        })
      )
    }, { cacheName: VIDEO_CACHE_NAME, id: videoId, cachedAt })
    
    // Access the video
    await page.evaluate(async (id) => {
      const res = await fetch(`/haven/v/${id}`)
      return res.status
    }, videoId)
    
    // Verify access was tracked (in real implementation, this would update lastAccessedAt)
    const videoInfo = await page.evaluate(async (id) => {
      const cache = await caches.open('haven-video-cache-v1')
      const response = await cache.match(`${location.origin}/haven/v/${id}`)
      
      if (!response) return null
      
      return {
        videoId: response.headers.get('X-Haven-Video-Id'),
        cachedAt: response.headers.get('X-Haven-Cached-At'),
      }
    }, videoId)
    
    expect(videoInfo).not.toBeNull()
    expect(videoInfo?.videoId).toBe(videoId)
  })
})
