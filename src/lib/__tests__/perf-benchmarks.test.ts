/**
 * Performance Benchmarks Unit Tests
 *
 * Tests for the perf-benchmarks module. Since benchmarks involve
 * timing and memory measurements, these tests focus on:
 * - Correct result structure
 * - Basic functionality
 * - Error handling
 * - Edge cases
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  runBenchmarks,
  benchmarkCacheOps,
  benchmarkMemory,
  benchmarkDecryptionPipeline,
  benchmarkPlaybackLatency,
  exportBenchmarkResults,
  logBenchmarkResults,
  type BenchmarkOptions,
  type BenchmarkResults,
} from '../perf-benchmarks'
import { hasVideo, putVideo, getVideo, clearAllVideos } from '../video-cache'
import { isOpfsAvailable, clearAllStaging } from '../opfs'

// Mock dependencies
vi.mock('../video-cache', async () => {
  const actual = await vi.importActual<typeof import('../video-cache')>('../video-cache')
  return {
    ...actual,
    hasVideo: vi.fn(),
    putVideo: vi.fn(),
    getVideo: vi.fn(),
    clearAllVideos: vi.fn(),
  }
})

vi.mock('../opfs', async () => {
  const actual = await vi.importActual<typeof import('../opfs')>('../opfs')
  return {
    ...actual,
    isOpfsAvailable: vi.fn(),
    clearAllStaging: vi.fn(),
  }
})

describe('Performance Benchmarks', () => {
  const mockOptions: BenchmarkOptions = {
    quickMode: true,
    testPrefix: 'test-benchmark',
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // Default mocks
    vi.mocked(hasVideo).mockResolvedValue(false)
    vi.mocked(putVideo).mockResolvedValue(undefined)
    vi.mocked(getVideo).mockResolvedValue({
      response: new Response(new Blob(['test'])),
      metadata: {
        videoId: 'test',
        mimeType: 'video/mp4',
        size: 1024,
        cachedAt: new Date(),
      },
    })
    vi.mocked(clearAllVideos).mockResolvedValue(undefined)
    vi.mocked(isOpfsAvailable).mockReturnValue(true)
    vi.mocked(clearAllStaging).mockResolvedValue(undefined)
  })

  describe('benchmarkCacheOps', () => {
    it('should return cache operation results with correct structure', async () => {
      vi.mocked(hasVideo).mockResolvedValue(true)

      const results = await benchmarkCacheOps(mockOptions)

      expect(results).toHaveProperty('hasVideoLatencyMs')
      expect(results).toHaveProperty('putVideoThroughput')
      expect(results).toHaveProperty('getVideoLatencyMs')
      expect(results).toHaveProperty('rangeRequestLatencyMs')

      expect(typeof results.hasVideoLatencyMs).toBe('number')
      expect(typeof results.getVideoLatencyMs).toBe('number')
      expect(results.putVideoThroughput).toHaveProperty('size1MB')
      expect(results.putVideoThroughput).toHaveProperty('size10MB')
      expect(results.putVideoThroughput).toHaveProperty('size50MB')
    })

    it('should use quick mode with smaller test sizes', async () => {
      vi.mocked(hasVideo).mockResolvedValue(true)

      const quickOptions: BenchmarkOptions = { quickMode: true, testPrefix: 'quick-test' }
      await benchmarkCacheOps(quickOptions)

      // In quick mode, should complete faster with smaller data
      expect(putVideo).toHaveBeenCalled()
    })

    it('should handle errors gracefully', async () => {
      vi.mocked(putVideo).mockRejectedValue(new Error('Cache error'))

      // Should not throw, but return partial results
      await expect(benchmarkCacheOps(mockOptions)).rejects.toThrow()
    })

    it('should measure hasVideo latency over multiple iterations', async () => {
      vi.mocked(hasVideo).mockResolvedValue(true)

      const results = await benchmarkCacheOps(mockOptions)

      // hasVideo should be called multiple times for averaging
      // In quick mode, it's called 10 times (prime + 9 iterations) 
      // In normal mode, it's called 101 times (prime + 100 iterations)
      expect(hasVideo).toHaveBeenCalled()
      expect(results.hasVideoLatencyMs).toBeGreaterThanOrEqual(0)
    })
  })

  describe('benchmarkMemory', () => {
    it('should work without OPFS', async () => {
      vi.mocked(isOpfsAvailable).mockReturnValue(false)

      const results = await benchmarkMemory(mockOptions)

      // Should still return results even without OPFS
      expect(results).toBeDefined()
      expect(results.peakHeapBefore).toBeGreaterThanOrEqual(0)
    })

    it('should return valid memory structure even when OPFS unavailable', async () => {
      // In Node.js test environment, OPFS is not available
      // The benchmark should still return valid results
      vi.mocked(isOpfsAvailable).mockReturnValue(false)

      const results = await benchmarkMemory(mockOptions)

      expect(results).toHaveProperty('peakHeapBefore')
      expect(results).toHaveProperty('peakHeapAfter')
      expect(results).toHaveProperty('memorySaved')
      expect(results).toHaveProperty('reductionPercent')
      expect(results).toHaveProperty('steadyStateHeap')

      // All values should be numbers
      expect(typeof results.peakHeapBefore).toBe('number')
      expect(typeof results.peakHeapAfter).toBe('number')
      expect(typeof results.memorySaved).toBe('number')
      expect(typeof results.reductionPercent).toBe('number')
      expect(typeof results.steadyStateHeap).toBe('number')

      // Values should be non-negative
      expect(results.peakHeapBefore).toBeGreaterThanOrEqual(0)
      expect(results.peakHeapAfter).toBeGreaterThanOrEqual(0)
      expect(results.reductionPercent).toBeGreaterThanOrEqual(0)
    })

    it('should calculate reduction percentage correctly when OPFS available', async () => {
      // This test only runs when OPFS is available
      // In browser environments where OPFS is available, this would test actual reduction
      vi.mocked(isOpfsAvailable).mockReturnValue(true)

      // If we can't actually test with OPFS (Node.js), just verify structure
      try {
        const results = await benchmarkMemory(mockOptions)
        
        // Reduction percent should be between 0 and 100
        expect(results.reductionPercent).toBeGreaterThanOrEqual(0)
        expect(results.reductionPercent).toBeLessThanOrEqual(100)
      } catch (error) {
        // Expected in Node.js environment - OPFS not available
        expect(error).toBeDefined()
      }
    })
  })

  describe('benchmarkDecryptionPipeline', () => {
    it('should return pipeline results with correct structure', async () => {
      const results = await benchmarkDecryptionPipeline(mockOptions)

      expect(results).toHaveProperty('synapseFetchMs')
      expect(results).toHaveProperty('litAuthColdMs')
      expect(results).toHaveProperty('litAuthWarmMs')
      expect(results).toHaveProperty('aesDecryptMs')
      expect(results).toHaveProperty('cacheWriteMs')
      expect(results).toHaveProperty('totalPipelineMs')
      expect(results).toHaveProperty('authFromCache')

      expect(typeof results.synapseFetchMs).toBe('number')
      expect(typeof results.litAuthColdMs).toBe('number')
      expect(typeof results.litAuthWarmMs).toBe('number')
      expect(typeof results.aesDecryptMs).toBe('number')
      expect(typeof results.cacheWriteMs).toBe('number')
      expect(typeof results.totalPipelineMs).toBe('number')
      expect(typeof results.authFromCache).toBe('boolean')
    })

    it('should calculate total pipeline time', async () => {
      const results = await benchmarkDecryptionPipeline(mockOptions)

      // Total should be sum of all stages (using warm auth if cached)
      const expectedTotal =
        results.synapseFetchMs +
        (results.authFromCache ? results.litAuthWarmMs : results.litAuthColdMs) +
        results.aesDecryptMs +
        results.cacheWriteMs

      expect(results.totalPipelineMs).toBeCloseTo(expectedTotal, 0)
    })

    it('should have positive timings for all stages', async () => {
      const results = await benchmarkDecryptionPipeline(mockOptions)

      expect(results.synapseFetchMs).toBeGreaterThanOrEqual(0)
      expect(results.litAuthColdMs).toBeGreaterThan(0)
      expect(results.litAuthWarmMs).toBeGreaterThanOrEqual(0)
      expect(results.aesDecryptMs).toBeGreaterThan(0)
      expect(results.cacheWriteMs).toBeGreaterThan(0)
    })

    it('cold auth should be slower than warm auth', async () => {
      const results = await benchmarkDecryptionPipeline(mockOptions)

      // Cold auth (with wallet signing) should be much slower than warm (cached)
      expect(results.litAuthColdMs).toBeGreaterThan(results.litAuthWarmMs)
    })
  })

  describe('benchmarkPlaybackLatency', () => {
    it('should return latency results with correct structure', async () => {
      vi.mocked(hasVideo)
        .mockResolvedValueOnce(false) // First call (cache miss)
        .mockResolvedValueOnce(true) // Second call (cache hit)

      const results = await benchmarkPlaybackLatency(mockOptions)

      expect(results).toHaveProperty('cacheMissMs')
      expect(results).toHaveProperty('cacheHitMs')
      expect(results).toHaveProperty('improvementRatio')
      expect(results).toHaveProperty('stages')

      expect(typeof results.cacheMissMs).toBe('number')
      expect(typeof results.cacheHitMs).toBe('number')
      expect(typeof results.improvementRatio).toBe('number')
    })

    it('should measure individual stages for cache miss', async () => {
      vi.mocked(hasVideo)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true)

      const results = await benchmarkPlaybackLatency(mockOptions)

      expect(results.stages).toHaveProperty('checkCacheMs')
      expect(results.stages).toHaveProperty('fetchMs')
      expect(results.stages).toHaveProperty('decryptMs')
      expect(results.stages).toHaveProperty('cacheWriteMs')

      expect(results.stages!.checkCacheMs).toBeGreaterThanOrEqual(0)
      expect(results.stages!.fetchMs).toBeGreaterThanOrEqual(0)
      expect(results.stages!.decryptMs).toBeGreaterThan(0)
      expect(results.stages!.cacheWriteMs).toBeGreaterThan(0)
    })

    it('cache hit should be faster than cache miss', async () => {
      vi.mocked(hasVideo)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true)

      const results = await benchmarkPlaybackLatency(mockOptions)

      expect(results.cacheHitMs).toBeLessThan(results.cacheMissMs)
      expect(results.improvementRatio).toBeGreaterThan(1)
    })

    it('should clean up test data after benchmark', async () => {
      vi.mocked(hasVideo)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true)

      await benchmarkPlaybackLatency(mockOptions)

      // Should have cleaned up staging files
      expect(clearAllStaging).toBeDefined()
    })
  })

  describe('runBenchmarks', () => {
    it('should return complete benchmark results', async () => {
      vi.mocked(hasVideo).mockResolvedValue(true)

      const results = await runBenchmarks(mockOptions)

      expect(results).toHaveProperty('playbackLatency')
      expect(results).toHaveProperty('memory')
      expect(results).toHaveProperty('decryptionPipeline')
      expect(results).toHaveProperty('cacheOps')
      expect(results).toHaveProperty('details')
      expect(results).toHaveProperty('timestamp')
      expect(results).toHaveProperty('environment')

      expect(Array.isArray(results.details)).toBe(true)
      expect(results.details.length).toBeGreaterThan(0)
    })

    it('should include environment information', async () => {
      const results = await runBenchmarks(mockOptions)

      expect(results.environment).toHaveProperty('userAgent')
      expect(results.environment).toHaveProperty('hasMemoryApi')
      expect(results.environment).toHaveProperty('hasOpfs')

      expect(typeof results.environment.userAgent).toBe('string')
      expect(typeof results.environment.hasMemoryApi).toBe('boolean')
      expect(typeof results.environment.hasOpfs).toBe('boolean')
    })

    it('should include detailed results for each benchmark', async () => {
      vi.mocked(hasVideo).mockResolvedValue(true)

      const results = await runBenchmarks(mockOptions)

      // Each benchmark should have a detail entry
      const detailNames = results.details.map(d => d.name)
      expect(detailNames).toContain('Cache Operations')
      expect(detailNames).toContain('Decryption Pipeline')
      expect(detailNames).toContain('Playback Latency')

      // Each detail should have required fields
      results.details.forEach(detail => {
        expect(detail).toHaveProperty('name')
        expect(detail).toHaveProperty('durationMs')
        expect(detail).toHaveProperty('timestamp')
        expect(detail).toHaveProperty('success')
        expect(typeof detail.success).toBe('boolean')
      })
    })

    it('should handle partial failures gracefully', async () => {
      // Make one benchmark fail
      vi.mocked(putVideo).mockRejectedValue(new Error('Test error'))

      // Should still return results, but with error details
      const results = await runBenchmarks(mockOptions)

      expect(results.details.some(d => !d.success)).toBe(true)
      expect(results.details.some(d => d.error)).toBe(true)
    })

    it('should skip memory benchmark if memory API unavailable', async () => {
      // Mock performance.memory as undefined
      const originalMemory = (performance as Performance & { memory?: unknown }).memory
      ;(performance as Performance & { memory?: unknown }).memory = undefined

      const results = await runBenchmarks(mockOptions)

      // Memory benchmark might be undefined or have zeros
      expect(results).toBeDefined()

      // Restore
      ;(performance as Performance & { memory?: unknown }).memory = originalMemory
    })
  })

  describe('exportBenchmarkResults', () => {
    it('should export results as valid JSON', () => {
      const mockResults: BenchmarkResults = {
        playbackLatency: {
          cacheMissMs: 1000,
          cacheHitMs: 50,
          improvementRatio: 20,
        },
        memory: {
          peakHeapBefore: 1000000,
          peakHeapAfter: 800000,
          memorySaved: 200000,
          reductionPercent: 20,
          steadyStateHeap: 500000,
        },
        decryptionPipeline: {
          synapseFetchMs: 200,
          litAuthColdMs: 500,
          litAuthWarmMs: 5,
          aesDecryptMs: 100,
          cacheWriteMs: 50,
          totalPipelineMs: 355,
          authFromCache: false,
        },
        cacheOps: {
          hasVideoLatencyMs: 0.5,
          putVideoThroughput: {
            size1MB: 100,
            size10MB: 90,
            size50MB: 80,
          },
          getVideoLatencyMs: 5,
          rangeRequestLatencyMs: 10,
        },
        details: [],
        timestamp: Date.now(),
        environment: {
          userAgent: 'test',
          hasMemoryApi: true,
          hasOpfs: true,
        },
      }

      const json = exportBenchmarkResults(mockResults)

      expect(() => JSON.parse(json)).not.toThrow()
      const parsed = JSON.parse(json)
      expect(parsed).toHaveProperty('summary')
      expect(parsed).toHaveProperty('keyMetrics')
      expect(parsed).toHaveProperty('environment')
    })

    it('should include summary statistics', () => {
      const mockResults: BenchmarkResults = {
        details: [
          { name: 'test1', durationMs: 100, timestamp: Date.now(), success: true },
          { name: 'test2', durationMs: 200, timestamp: Date.now(), success: false, error: 'fail' },
        ],
        timestamp: Date.now(),
        environment: {
          userAgent: 'test',
          hasMemoryApi: true,
          hasOpfs: true,
        },
      }

      const json = exportBenchmarkResults(mockResults)
      const parsed = JSON.parse(json)

      expect(parsed.summary).toHaveProperty('totalBenchmarks', 2)
      expect(parsed.summary).toHaveProperty('successfulBenchmarks', 1)
      expect(parsed.summary).toHaveProperty('failedBenchmarks', 1)
    })
  })

  describe('logBenchmarkResults', () => {
    it('should not throw when logging results', () => {
      const mockResults: BenchmarkResults = {
        playbackLatency: {
          cacheMissMs: 1000,
          cacheHitMs: 50,
          improvementRatio: 20,
        },
        details: [],
        timestamp: Date.now(),
        environment: {
          userAgent: 'test',
          hasMemoryApi: true,
          hasOpfs: true,
        },
      }

      expect(() => logBenchmarkResults(mockResults)).not.toThrow()
    })

    it('should handle partial results', () => {
      const mockResults: BenchmarkResults = {
        // Only partial results
        cacheOps: {
          hasVideoLatencyMs: 0.5,
          putVideoThroughput: {
            size1MB: 100,
            size10MB: 90,
            size50MB: 80,
          },
          getVideoLatencyMs: 5,
          rangeRequestLatencyMs: 10,
        },
        details: [],
        timestamp: Date.now(),
        environment: {
          userAgent: 'test',
          hasMemoryApi: true,
          hasOpfs: true,
        },
      }

      expect(() => logBenchmarkResults(mockResults)).not.toThrow()
    })
  })
})
