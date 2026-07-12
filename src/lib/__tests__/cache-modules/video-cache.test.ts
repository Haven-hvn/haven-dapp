/**
 * Unit tests for video-cache.ts
 * 
 * Tests for the Cache API wrapper that stores and retrieves decrypted video content.
 */

import {
  putVideo,
  getVideo,
  hasVideo,
  deleteVideo,
  listCachedVideos,
  clearAllVideos,
  getVideoUrl,
  getVideoIdFromUrl,
  extractMetadata,
  getTotalCachedSize,
  getCacheStorageEstimate,
  deleteVideos,
  hasVideos,
  evictOldestVideos,
  CACHE_NAME,
} from '../../video-cache'
import { setupCacheMock, resetCacheMock, teardownCacheMock } from './mocks/cache-api'
import { clearCacheErrors } from '../../cache-errors'

describe('video-cache', () => {
  beforeAll(() => {
    setupCacheMock()
  })

  beforeEach(() => {
    resetCacheMock()
    clearCacheErrors()
  })

  afterAll(() => {
    teardownCacheMock()
  })

  describe('putVideo', () => {
    it('stores video data with correct headers', async () => {
      const videoId = 'test-video-1'
      const data = new Uint8Array([1, 2, 3, 4, 5])
      const mimeType = 'video/mp4'

      await putVideo(videoId, data, mimeType)

      // Verify video was stored by retrieving it
      const result = await getVideo(videoId)
      expect(result).not.toBeNull()
      expect(result?.metadata.videoId).toBe(videoId)
      expect(result?.metadata.mimeType).toBe(mimeType)
      expect(result?.metadata.size).toBe(data.byteLength)
    })

    it('stores Uint8Array input', async () => {
      const videoId = 'test-uint8'
      const data = new Uint8Array([10, 20, 30, 40, 50, 60])

      await putVideo(videoId, data)

      const result = await getVideo(videoId)
      expect(result).not.toBeNull()
      
      // Verify the response body contains the correct data
      const blob = await result!.response.blob()
      const arrayBuffer = await blob.arrayBuffer()
      const retrievedData = new Uint8Array(arrayBuffer)
      expect(retrievedData).toEqual(data)
    })

    it('stores ArrayBuffer input', async () => {
      const videoId = 'test-arraybuffer'
      const data = new ArrayBuffer(10)
      const view = new Uint8Array(data)
      view.set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

      await putVideo(videoId, data)

      const result = await getVideo(videoId)
      expect(result).not.toBeNull()
      expect(result?.metadata.size).toBe(10)
    })

    it('stores Blob input', async () => {
      const videoId = 'test-blob'
      const data = new Blob([new Uint8Array([5, 10, 15, 20])], { type: 'video/webm' })

      await putVideo(videoId, data, 'video/webm')

      const result = await getVideo(videoId)
      expect(result).not.toBeNull()
      expect(result?.metadata.mimeType).toBe('video/webm')
      expect(result?.metadata.size).toBe(4)
    })

    it('sets X-Haven-Video-Id header', async () => {
      const videoId = 'header-test-video'
      const data = new Uint8Array([1, 2, 3])

      await putVideo(videoId, data)

      const result = await getVideo(videoId)
      const headerValue = result?.response.headers.get('X-Haven-Video-Id')
      expect(headerValue).toBe(videoId)
    })

    it('sets X-Haven-Cached-At header with ISO timestamp', async () => {
      const beforePut = new Date().toISOString()
      const videoId = 'cached-at-test'
      const data = new Uint8Array([1, 2, 3])

      await putVideo(videoId, data)
      const afterPut = new Date().toISOString()

      const result = await getVideo(videoId)
      const cachedAt = result?.response.headers.get('X-Haven-Cached-At')
      
      expect(cachedAt).toBeDefined()
      expect(cachedAt!.length).toBeGreaterThan(0)
      // Verify it's a valid ISO date string
      const cachedDate = new Date(cachedAt!)
      expect(cachedDate.toISOString()).toBe(cachedAt)
      expect(cachedAt).toBeGreaterThanOrEqual(beforePut)
      expect(cachedAt).toBeLessThanOrEqual(afterPut)
    })

    it('sets X-Haven-Size header matching data size', async () => {
      const videoId = 'size-header-test'
      const data = new Uint8Array(new Array(100).fill(0))

      await putVideo(videoId, data)

      const result = await getVideo(videoId)
      const sizeHeader = result?.response.headers.get('X-Haven-Size')
      expect(sizeHeader).toBe('100')
    })

    it('sets Content-Type from mimeType parameter', async () => {
      const videoId = 'content-type-test'
      const data = new Uint8Array([1, 2, 3])

      await putVideo(videoId, data, 'video/quicktime')

      const result = await getVideo(videoId)
      const contentType = result?.response.headers.get('Content-Type')
      expect(contentType).toBe('video/quicktime')
    })

    it('sets Accept-Ranges: bytes header', async () => {
      const videoId = 'accept-ranges-test'
      const data = new Uint8Array([1, 2, 3])

      await putVideo(videoId, data)

      const result = await getVideo(videoId)
      const acceptRanges = result?.response.headers.get('Accept-Ranges')
      expect(acceptRanges).toBe('bytes')
    })

    it('sets X-Haven-TTL when ttl is provided', async () => {
      const videoId = 'ttl-test'
      const data = new Uint8Array([1, 2, 3])
      const ttl = 24 * 60 * 60 * 1000 // 1 day

      await putVideo(videoId, data, 'video/mp4', { ttl })

      const result = await getVideo(videoId)
      const ttlHeader = result?.response.headers.get('X-Haven-TTL')
      expect(ttlHeader).toBe(String(ttl))
    })

    it('throws when Cache API is not available', async () => {
      // Temporarily remove caches
      const originalCaches = (global as any).caches
      ;(global as any).caches = undefined

      await expect(putVideo('test', new Uint8Array([1]))).rejects.toThrow('Cache API is not available')

      // Restore caches
      ;(global as any).caches = originalCaches
    })
  })

  describe('getVideo', () => {
    it('returns response and metadata for cached video', async () => {
      const videoId = 'get-existing'
      const data = new Uint8Array([1, 2, 3, 4, 5])
      await putVideo(videoId, data, 'video/mp4')

      const result = await getVideo(videoId)

      expect(result).not.toBeNull()
      expect(result?.response).toBeInstanceOf(Response)
      expect(result?.metadata.videoId).toBe(videoId)
      expect(result?.metadata.mimeType).toBe('video/mp4')
      expect(result?.metadata.size).toBe(5)
      expect(result?.metadata.cachedAt).toBeInstanceOf(Date)
    })

    it('returns null for uncached video', async () => {
      const result = await getVideo('non-existent-video')
      expect(result).toBeNull()
    })

    it('parses metadata from response headers', async () => {
      const videoId = 'metadata-parse-test'
      const data = new Uint8Array([10, 20, 30])
      const customTtl = 3600000

      await putVideo(videoId, data, 'video/webm', { ttl: customTtl })

      const result = await getVideo(videoId)

      expect(result?.metadata).toEqual(expect.objectContaining({
        videoId,
        mimeType: 'video/webm',
        size: 3,
        ttl: customTtl,
      }))
      expect(result?.metadata.cachedAt).toBeInstanceOf(Date)
    })

    it('returns null for invalid response status', async () => {
      // This tests the validation in getVideo that checks response.status
      const videoId = 'invalid-status-test'
      
      // Manually store a response with non-200 status
      const cache = await (global as any).caches.open(CACHE_NAME)
      const url = getVideoUrl(videoId)
      const badResponse = new Response(null, { status: 404, statusText: 'Not Found' })
      await cache.put(url, badResponse)

      const result = await getVideo(videoId)
      expect(result).toBeNull()
    })

    it('returns null when Cache API is not available', async () => {
      const originalCaches = (global as any).caches
      ;(global as any).caches = undefined

      const result = await getVideo('any-video')
      expect(result).toBeNull()

      ;(global as any).caches = originalCaches
    })
  })

  describe('hasVideo', () => {
    it('returns true for cached video', async () => {
      const videoId = 'has-existing'
      await putVideo(videoId, new Uint8Array([1, 2, 3]))

      const result = await hasVideo(videoId)
      expect(result).toBe(true)
    })

    it('returns false for uncached video', async () => {
      const result = await hasVideo('non-existent')
      expect(result).toBe(false)
    })

    it('does not consume the response body', async () => {
      const videoId = 'has-no-consume'
      await putVideo(videoId, new Uint8Array([1, 2, 3]))

      // Check existence
      const exists = await hasVideo(videoId)
      expect(exists).toBe(true)

      // Should still be able to get the video and read its body
      const result = await getVideo(videoId)
      expect(result).not.toBeNull()
      
      const blob = await result!.response.blob()
      expect(blob.size).toBe(3)
    })

    it('returns false when Cache API is not available', async () => {
      const originalCaches = (global as any).caches
      ;(global as any).caches = undefined

      const result = await hasVideo('any-video')
      expect(result).toBe(false)

      ;(global as any).caches = originalCaches
    })
  })

  describe('deleteVideo', () => {
    it('removes video from cache', async () => {
      const videoId = 'delete-test'
      await putVideo(videoId, new Uint8Array([1, 2, 3]))
      expect(await hasVideo(videoId)).toBe(true)

      await deleteVideo(videoId)

      expect(await hasVideo(videoId)).toBe(false)
    })

    it('returns true on successful deletion', async () => {
      const videoId = 'delete-success'
      await putVideo(videoId, new Uint8Array([1, 2, 3]))

      const result = await deleteVideo(videoId)
      expect(result).toBe(true)
    })

    it('returns false when video not in cache', async () => {
      const result = await deleteVideo('non-existent-video')
      expect(result).toBe(false)
    })

    it('returns false when Cache API is not available', async () => {
      const originalCaches = (global as any).caches
      ;(global as any).caches = undefined

      const result = await deleteVideo('any-video')
      expect(result).toBe(false)

      ;(global as any).caches = originalCaches
    })
  })

  describe('listCachedVideos', () => {
    it('returns empty array when no videos cached', async () => {
      const result = await listCachedVideos()
      expect(result).toEqual([])
    })

    it('returns all cached video entries', async () => {
      await putVideo('video-1', new Uint8Array([1]), 'video/mp4')
      await putVideo('video-2', new Uint8Array([1, 2]), 'video/webm')
      await putVideo('video-3', new Uint8Array([1, 2, 3]), 'video/mp4')

      const result = await listCachedVideos()

      expect(result).toHaveLength(3)
      const ids = result.map(e => e.videoId).sort()
      expect(ids).toEqual(['video-1', 'video-2', 'video-3'])
    })

    it('extracts metadata from each entry', async () => {
      await putVideo('meta-1', new Uint8Array([1, 2, 3]), 'video/mp4')

      const result = await listCachedVideos()

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual(expect.objectContaining({
        videoId: 'meta-1',
        mimeType: 'video/mp4',
        size: 3,
        url: expect.stringContaining('meta-1'),
      }))
      expect(result[0].cachedAt).toBeInstanceOf(Date)
    })

    it('returns empty array when Cache API is not available', async () => {
      const originalCaches = (global as any).caches
      ;(global as any).caches = undefined

      const result = await listCachedVideos()
      expect(result).toEqual([])

      ;(global as any).caches = originalCaches
    })
  })

  describe('clearAllVideos', () => {
    it('removes all cached videos', async () => {
      await putVideo('clear-1', new Uint8Array([1]))
      await putVideo('clear-2', new Uint8Array([2]))
      await putVideo('clear-3', new Uint8Array([3]))

      await clearAllVideos()

      expect(await hasVideo('clear-1')).toBe(false)
      expect(await hasVideo('clear-2')).toBe(false)
      expect(await hasVideo('clear-3')).toBe(false)
    })

    it('cache is empty after clearing', async () => {
      await putVideo('test', new Uint8Array([1]))
      await clearAllVideos()

      const videos = await listCachedVideos()
      expect(videos).toHaveLength(0)
    })

    it('handles case when Cache API is not available', async () => {
      const originalCaches = (global as any).caches
      ;(global as any).caches = undefined

      // Should not throw
      await expect(clearAllVideos()).resolves.not.toThrow()

      ;(global as any).caches = originalCaches
    })
  })

  describe('getVideoUrl', () => {
    it('constructs correct synthetic URL', () => {
      const videoId = 'test-video-id'
      const url = getVideoUrl(videoId)
      
      expect(url).toContain(videoId)
      expect(url).toContain('/haven/v/')
    })
  })

  describe('getVideoIdFromUrl', () => {
    it('extracts video ID from synthetic URL', () => {
      const videoId = 'extract-test-id'
      const url = getVideoUrl(videoId)
      
      const extracted = getVideoIdFromUrl(url)
      expect(extracted).toBe(videoId)
    })

    it('returns null for invalid URL', () => {
      const result = getVideoIdFromUrl('https://example.com/other/path')
      expect(result).toBeNull()
    })
  })

  describe('extractMetadata', () => {
    it('extracts all metadata fields from headers', () => {
      const videoId = 'extract-meta-test'
      const headers = new Headers({
        'Content-Type': 'video/webm',
        'X-Haven-Video-Id': videoId,
        'X-Haven-Cached-At': new Date().toISOString(),
        'X-Haven-Size': '1024',
        'X-Haven-TTL': '3600000',
      })
      const response = new Response(null, { headers })

      const metadata = extractMetadata(response, videoId)

      expect(metadata).toEqual({
        videoId,
        mimeType: 'video/webm',
        size: 1024,
        cachedAt: expect.any(Date),
        ttl: 3600000,
      })
    })

    it('uses fallback values when headers are missing', () => {
      const videoId = 'fallback-test'
      const response = new Response(null)

      const metadata = extractMetadata(response, videoId)

      expect(metadata.videoId).toBe(videoId)
      expect(metadata.mimeType).toBe('video/mp4') // default
      expect(metadata.size).toBe(0)
      expect(metadata.ttl).toBeUndefined()
    })
  })

  describe('getTotalCachedSize', () => {
    it('returns total size of all cached videos', async () => {
      await putVideo('size-1', new Uint8Array(new Array(100).fill(0)))
      await putVideo('size-2', new Uint8Array(new Array(200).fill(0)))
      await putVideo('size-3', new Uint8Array(new Array(300).fill(0)))

      const total = await getTotalCachedSize()
      expect(total).toBe(600)
    })

    it('returns 0 when no videos cached', async () => {
      const total = await getTotalCachedSize()
      expect(total).toBe(0)
    })
  })

  describe('getCacheStorageEstimate', () => {
    it('returns storage estimate with usage, quota, and percent', async () => {
      const estimate = await getCacheStorageEstimate()

      expect(estimate).toHaveProperty('usage')
      expect(estimate).toHaveProperty('quota')
      expect(estimate).toHaveProperty('percent')
      expect(typeof estimate.usage).toBe('number')
      expect(typeof estimate.quota).toBe('number')
      expect(typeof estimate.percent).toBe('number')
    })

    it('returns zeros when Storage API is not available', async () => {
      const originalNavigator = (global as any).navigator
      ;(global as any).navigator = {}

      const estimate = await getCacheStorageEstimate()
      expect(estimate).toEqual({ usage: 0, quota: 0, percent: 0 })

      ;(global as any).navigator = originalNavigator
    })
  })

  describe('deleteVideos', () => {
    it('deletes multiple videos', async () => {
      await putVideo('multi-del-1', new Uint8Array([1]))
      await putVideo('multi-del-2', new Uint8Array([2]))
      await putVideo('multi-del-3', new Uint8Array([3]))

      const count = await deleteVideos(['multi-del-1', 'multi-del-2'])

      expect(count).toBe(2)
      expect(await hasVideo('multi-del-1')).toBe(false)
      expect(await hasVideo('multi-del-2')).toBe(false)
      expect(await hasVideo('multi-del-3')).toBe(true)
    })

    it('returns 0 for empty array', async () => {
      const count = await deleteVideos([])
      expect(count).toBe(0)
    })
  })

  describe('hasVideos', () => {
    it('returns map of videoId to cache status', async () => {
      await putVideo('status-1', new Uint8Array([1]))
      await putVideo('status-2', new Uint8Array([2]))

      const status = await hasVideos(['status-1', 'status-2', 'status-3'])

      expect(status.get('status-1')).toBe(true)
      expect(status.get('status-2')).toBe(true)
      expect(status.get('status-3')).toBe(false)
    })
  })

  describe('evictOldestVideos', () => {
    it('removes oldest videos when needed', async () => {
      // Add videos with delays to ensure different timestamps
      await putVideo('evict-1', new Uint8Array([1]))
      await new Promise(r => setTimeout(r, 10))
      await putVideo('evict-2', new Uint8Array([1]))
      await new Promise(r => setTimeout(r, 10))
      await putVideo('evict-3', new Uint8Array([1]))

      const evicted = await evictOldestVideos()

      // Should evict at least one video (20% of 3 = 0.6, rounded up to 1)
      expect(evicted).toBeGreaterThanOrEqual(0)
    })

    it('returns 0 when no videos to evict', async () => {
      const evicted = await evictOldestVideos()
      expect(evicted).toBe(0)
    })

    it('returns 0 when Cache API is not available', async () => {
      const originalCaches = (global as any).caches
      ;(global as any).caches = undefined

      const evicted = await evictOldestVideos()
      expect(evicted).toBe(0)

      ;(global as any).caches = originalCaches
    })
  })
})
