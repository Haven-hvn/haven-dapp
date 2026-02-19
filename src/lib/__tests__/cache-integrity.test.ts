/**
 * Cache Integrity Verification Tests
 *
 * Tests for cache entry verification and corruption detection.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  verifyCacheEntry,
  verifyMultipleEntries,
  safeGetVideo,
  getCacheHealthMetrics,
} from '../cache-integrity'
import { getVideo, deleteVideo } from '../video-cache'
import { clearCacheErrors } from '../cache-errors'

// Mock video-cache module
vi.mock('../video-cache', () => ({
  getVideo: vi.fn(),
  deleteVideo: vi.fn(),
  getVideoUrl: vi.fn((id: string) => `https://example.com/haven/v/${id}`),
  VIDEO_URL_PREFIX: '/haven/v/',
}))

describe('Cache Integrity Verification', () => {
  beforeEach(() => {
    clearCacheErrors()
    vi.clearAllMocks()
  })

  describe('verifyCacheEntry', () => {
    it('returns valid=true for good cache entry', async () => {
      const mockResponse = new Response(new Blob([new Uint8Array(1024)]), {
        status: 200,
        headers: {
          'Content-Type': 'video/mp4',
          'X-Haven-Size': '1024',
        },
      })

      vi.mocked(getVideo).mockResolvedValue({
        response: mockResponse,
        metadata: {
          videoId: '0x123',
          mimeType: 'video/mp4',
          size: 1024,
          cachedAt: new Date(),
        },
      })

      const result = await verifyCacheEntry('0x123')
      expect(result.valid).toBe(true)
    })

    it('returns valid=false for non-existent entry', async () => {
      vi.mocked(getVideo).mockResolvedValue(null)

      const result = await verifyCacheEntry('0x123')
      expect(result.valid).toBe(false)
      expect(result.errorCode).toBe('CACHE_READ_FAILED')
      expect(result.message).toContain('not found')
    })

    it('returns valid=false for non-200 status', async () => {
      const mockResponse = new Response(null, { status: 404 })

      vi.mocked(getVideo).mockResolvedValue({
        response: mockResponse,
        metadata: {
          videoId: '0x123',
          mimeType: 'video/mp4',
          size: 0,
          cachedAt: new Date(),
        },
      })

      const result = await verifyCacheEntry('0x123')
      expect(result.valid).toBe(false)
      expect(result.errorCode).toBe('CACHE_READ_FAILED')
      expect(result.message).toContain('status')
    })

    it('returns valid=false for invalid content type', async () => {
      const mockResponse = new Response(new Blob([new Uint8Array(1024)]), {
        status: 200,
        headers: {
          'Content-Type': 'text/html',
          'X-Haven-Size': '1024',
        },
      })

      vi.mocked(getVideo).mockResolvedValue({
        response: mockResponse,
        metadata: {
          videoId: '0x123',
          mimeType: 'text/html',
          size: 1024,
          cachedAt: new Date(),
        },
      })

      const result = await verifyCacheEntry('0x123')
      expect(result.valid).toBe(false)
      expect(result.errorCode).toBe('CACHE_CORRUPTED')
      expect(result.message).toContain('Content-Type')
    })

    it('returns valid=false for too small blob', async () => {
      const mockResponse = new Response(new Blob([new Uint8Array(512)]), {
        status: 200,
        headers: {
          'Content-Type': 'video/mp4',
          'X-Haven-Size': '512',
        },
      })

      vi.mocked(getVideo).mockResolvedValue({
        response: mockResponse,
        metadata: {
          videoId: '0x123',
          mimeType: 'video/mp4',
          size: 512,
          cachedAt: new Date(),
        },
      })

      const result = await verifyCacheEntry('0x123')
      expect(result.valid).toBe(false)
      expect(result.errorCode).toBe('CACHE_CORRUPTED')
      expect(result.message).toContain('too small')
    })

    it('returns valid=false for size mismatch', async () => {
      const mockResponse = new Response(new Blob([new Uint8Array(2048)]), {
        status: 200,
        headers: {
          'Content-Type': 'video/mp4',
          'X-Haven-Size': '2048',
        },
      })

      vi.mocked(getVideo).mockResolvedValue({
        response: mockResponse,
        metadata: {
          videoId: '0x123',
          mimeType: 'video/mp4',
          size: 100, // Different from actual blob size
          cachedAt: new Date(),
        },
      })

      const result = await verifyCacheEntry('0x123')
      expect(result.valid).toBe(false)
      expect(result.errorCode).toBe('CACHE_CORRUPTED')
      expect(result.message).toContain('Size mismatch')
    })

    it('handles errors during verification', async () => {
      vi.mocked(getVideo).mockRejectedValue(new Error('Cache error'))

      const result = await verifyCacheEntry('0x123')
      expect(result.valid).toBe(false)
      expect(result.errorCode).toBe('INTEGRITY_CHECK_FAILED')
    })
  })

  describe('verifyMultipleEntries', () => {
    it('verifies multiple entries in parallel', async () => {
      const mockResponse = new Response(new Blob([new Uint8Array(1024)]), {
        status: 200,
        headers: {
          'Content-Type': 'video/mp4',
          'X-Haven-Size': '1024',
        },
      })

      vi.mocked(getVideo)
        .mockResolvedValueOnce({
          response: mockResponse,
          metadata: { videoId: '0x1', mimeType: 'video/mp4', size: 1024, cachedAt: new Date() },
        })
        .mockResolvedValueOnce(null) // Corrupted
        .mockResolvedValueOnce({
          response: mockResponse,
          metadata: { videoId: '0x3', mimeType: 'video/mp4', size: 1024, cachedAt: new Date() },
        })

      const result = await verifyMultipleEntries(['0x1', '0x2', '0x3'])

      expect(result.total).toBe(3)
      expect(result.valid).toBe(2)
      expect(result.invalid).toBe(1)
      expect(result.invalidIds).toContain('0x2')
    })
  })

  describe('safeGetVideo', () => {
    it('returns video when valid', async () => {
      const mockResponse = new Response(new Blob([new Uint8Array(1024)]), {
        status: 200,
        headers: {
          'Content-Type': 'video/mp4',
          'X-Haven-Size': '1024',
        },
      })

      const videoData = {
        response: mockResponse,
        metadata: { videoId: '0x123', mimeType: 'video/mp4', size: 1024, cachedAt: new Date() },
      }

      vi.mocked(getVideo).mockResolvedValue(videoData)

      const result = await safeGetVideo('0x123')
      expect(result).toEqual(videoData)
      expect(deleteVideo).not.toHaveBeenCalled()
    })

    it('returns null and deletes corrupted entry', async () => {
      vi.mocked(getVideo).mockResolvedValue(null)
      vi.mocked(deleteVideo).mockResolvedValue(true)

      const result = await safeGetVideo('0x123')
      expect(result).toBeNull()
      expect(deleteVideo).toHaveBeenCalledWith('0x123')
    })

    it('does not delete when autoDelete is false', async () => {
      vi.mocked(getVideo).mockResolvedValue(null)

      const result = await safeGetVideo('0x123', { autoDelete: false })
      expect(result).toBeNull()
      expect(deleteVideo).not.toHaveBeenCalled()
    })

    it('returns null when not cached', async () => {
      vi.mocked(getVideo).mockResolvedValue(null)

      const result = await safeGetVideo('0x123')
      expect(result).toBeNull()
    })
  })

  describe('getCacheHealthMetrics', () => {
    it('calculates health metrics', async () => {
      const mockResponse = new Response(new Blob([new Uint8Array(1024)]), {
        status: 200,
        headers: {
          'Content-Type': 'video/mp4',
          'X-Haven-Size': '1024',
        },
      })

      vi.mocked(getVideo)
        .mockResolvedValueOnce({
          response: mockResponse,
          metadata: { videoId: '0x1', mimeType: 'video/mp4', size: 1024, cachedAt: new Date() },
        })
        .mockResolvedValueOnce(null) // Invalid
        .mockResolvedValueOnce({
          response: mockResponse,
          metadata: { videoId: '0x3', mimeType: 'video/mp4', size: 1024, cachedAt: new Date() },
        })

      const metrics = await getCacheHealthMetrics(['0x1', '0x2', '0x3'])

      expect(metrics.totalEntries).toBe(3)
      expect(metrics.validEntries).toBe(2)
      expect(metrics.corruptedEntries).toBe(1)
      expect(metrics.healthScore).toBe(66.7) // 2/3 = 66.67%
    })

    it('returns 100% health for all valid', async () => {
      const mockResponse = new Response(new Blob([new Uint8Array(1024)]), {
        status: 200,
        headers: {
          'Content-Type': 'video/mp4',
          'X-Haven-Size': '1024',
        },
      })

      vi.mocked(getVideo).mockResolvedValue({
        response: mockResponse,
        metadata: { videoId: '0x1', mimeType: 'video/mp4', size: 1024, cachedAt: new Date() },
      })

      const metrics = await getCacheHealthMetrics(['0x1'])
      expect(metrics.healthScore).toBe(100)
    })

    it('returns 100% health for empty array', async () => {
      const metrics = await getCacheHealthMetrics([])
      expect(metrics.healthScore).toBe(100)
    })
  })
})
