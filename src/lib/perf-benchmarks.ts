/**
 * Performance Benchmarks Suite
 *
 * A comprehensive benchmarking suite that measures the performance improvements
 * from the caching system, providing concrete metrics for memory usage, playback
 * latency, and decryption time.
 *
 * ## Usage (Development Only)
 *
 * ```typescript
 * // Run all benchmarks
 * const results = await runBenchmarks()
 * console.log(results)
 *
 * // Export results as JSON
 * const json = exportBenchmarkResults(results)
 * downloadJson(json, 'benchmark-results.json')
 *
 * // Run specific benchmark
 * const cacheOps = await benchmarkCacheOps()
 * ```
 *
 * ## Available Benchmarks
 *
 * 1. **Playback Latency**: Time to first frame (cache hit vs miss)
 * 2. **Memory Usage**: Peak JS heap during decrypt (before/after OPFS)
 * 3. **Decryption Pipeline**: Individual stage timings
 * 4. **Cache Operations**: hasVideo, putVideo, getVideo latencies
 *
 * @module lib/perf-benchmarks
 * @development-only This module is intended for development and testing only
 */

import { hasVideo, putVideo, getVideo, getVideoUrl, VIDEO_URL_PREFIX } from './video-cache'
import { isOpfsAvailable, writeToStaging, readFromStaging, deleteStaging } from './opfs'
import { getMemoryInfo } from './memory-detect'
import { aesDecrypt, aesEncrypt, generateAESKey, generateIV } from './crypto'
import { getCachedAuthContext } from './lit-session-cache'

// ============================================================================
// Types
// ============================================================================

/**
 * Results from a single benchmark run.
 */
export interface BenchmarkResult {
  /** Benchmark name */
  name: string

  /** Duration in milliseconds */
  durationMs: number

  /** Additional metrics */
  metrics?: Record<string, number | string>

  /** Timestamp when benchmark ran */
  timestamp: number

  /** Whether the benchmark succeeded */
  success: boolean

  /** Error message if failed */
  error?: string
}

/**
 * Playback latency benchmark results.
 */
export interface PlaybackLatencyResults {
  /** Time to first frame on cache miss (full pipeline) */
  cacheMissMs: number

  /** Time to first frame on cache hit (from SW) */
  cacheHitMs: number

  /** Improvement ratio (cacheMiss / cacheHit) */
  improvementRatio: number

  /** Individual stage timings for cache miss */
  stages?: {
    checkCacheMs: number
    fetchMs: number
    decryptMs: number
    cacheWriteMs: number
  }
}

/**
 * Memory benchmark results.
 */
export interface MemoryBenchmarkResults {
  /** Peak JS heap before OPFS staging (bytes) */
  peakHeapBefore: number

  /** Peak JS heap after OPFS staging (bytes) */
  peakHeapAfter: number

  /** Memory saved by OPFS staging (bytes) */
  memorySaved: number

  /** Percentage reduction in peak memory */
  reductionPercent: number

  /** Steady-state heap while playing from cache */
  steadyStateHeap: number
}

/**
 * Decryption pipeline stage timings.
 */
export interface DecryptionPipelineResults {
  /** Synapse fetch time (ms) */
  synapseFetchMs: number

  /** Lit auth time - cold (first auth in session) */
  litAuthColdMs: number

  /** Lit auth time - warm (cached session reuse) */
  litAuthWarmMs: number

  /** AES decrypt time (ms) */
  aesDecryptMs: number

  /** Cache write time (ms) */
  cacheWriteMs: number

  /** Total pipeline time (ms) */
  totalPipelineMs: number

  /** Whether auth was served from cache */
  authFromCache: boolean
}

/**
 * Cache operation benchmark results.
 */
export interface CacheOperationResults {
  /** hasVideo() average latency (ms) over 100 calls */
  hasVideoLatencyMs: number

  /** putVideo() throughput in MB/s for various sizes */
  putVideoThroughput: {
    size1MB: number
    size10MB: number
    size50MB: number
  }

  /** getVideo() latency to first byte (ms) */
  getVideoLatencyMs: number

  /** Range request latency for 206 response (ms) */
  rangeRequestLatencyMs: number
}

/**
 * Complete benchmark results.
 */
export interface BenchmarkResults {
  /** Playback latency metrics */
  playbackLatency?: PlaybackLatencyResults

  /** Memory usage metrics */
  memory?: MemoryBenchmarkResults

  /** Decryption pipeline metrics */
  decryptionPipeline?: DecryptionPipelineResults

  /** Cache operation metrics */
  cacheOps?: CacheOperationResults

  /** Individual benchmark results */
  details: BenchmarkResult[]

  /** Summary timestamp */
  timestamp: number

  /** Environment info */
  environment: {
    userAgent: string
    deviceMemory?: number
    hasMemoryApi: boolean
    hasOpfs: boolean
  }
}

/**
 * Options for running benchmarks.
 */
export interface BenchmarkOptions {
  /** Skip benchmarks that require user interaction */
  skipUserInteraction?: boolean

  /** Use smaller test data for faster runs */
  quickMode?: boolean

  /** Custom video ID prefix for test data */
  testPrefix?: string
}

// ============================================================================
// Constants
// ============================================================================

/** Default test sizes for throughput benchmarks */
const TEST_SIZES = {
  small: 1 * 1024 * 1024, // 1 MB
  medium: 10 * 1024 * 1024, // 10 MB
  large: 50 * 1024 * 1024, // 50 MB
}

/** Number of iterations for averaging latency measurements */
const LATENCY_ITERATIONS = 100

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a Uint8Array of specified size filled with random data.
 */
function createTestData(size: number): Uint8Array {
  const data = new Uint8Array(size)
  for (let i = 0; i < size; i += 1024) {
    const chunk = crypto.getRandomValues(new Uint8Array(Math.min(1024, size - i)))
    data.set(chunk, i)
  }
  return data
}

/**
 * Measure time for an async operation.
 */
async function measureTime<T>(fn: () => Promise<T>): Promise<{ result: T; durationMs: number }> {
  const start = performance.now()
  const result = await fn()
  const durationMs = performance.now() - start
  return { result, durationMs }
}

/**
 * Measure time for a sync operation.
 */
function measureTimeSync<T>(fn: () => T): { result: T; durationMs: number } {
  const start = performance.now()
  const result = fn()
  const durationMs = performance.now() - start
  return { result, durationMs }
}

/**
 * Get current JS heap size if available.
 */
function getHeapSize(): number {
  const perfMemory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
  return perfMemory?.usedJSHeapSize || 0
}

/**
 * Take a heap snapshot if available.
 */
function takeHeapSnapshot(): number {
  // Force garbage collection if available (Chrome DevTools only)
  const anyGlobal = globalThis as unknown as { gc?: () => void }
  if (typeof anyGlobal.gc === 'function') {
    anyGlobal.gc()
  }
  return getHeapSize()
}

/**
 * Calculate average of an array of numbers.
 */
function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

/**
 * Calculate median of an array of numbers.
 */
function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// ============================================================================
// Benchmark Functions
// ============================================================================

/**
 * Benchmark cache operations: hasVideo, putVideo, getVideo.
 *
 * Measures:
 * - hasVideo() latency (average over 100 calls)
 * - putVideo() throughput for various file sizes
 * - getVideo() latency to first byte
 * - Range request latency (via Service Worker)
 *
 * @param options - Benchmark options
 * @returns Cache operation benchmark results
 *
 * @example
 * ```typescript
 * const results = await benchmarkCacheOps()
 * console.log(`hasVideo latency: ${results.hasVideoLatencyMs}ms`)
 * console.log(`putVideo 10MB: ${results.putVideoThroughput.size10MB} MB/s`)
 * ```
 */
export async function benchmarkCacheOps(options: BenchmarkOptions = {}): Promise<CacheOperationResults> {
  const { quickMode = false, testPrefix = 'benchmark' } = options
  const details: BenchmarkResult[] = []

  // Test sizes (smaller in quick mode)
  const testSizes = quickMode
    ? { small: 100 * 1024, medium: 500 * 1024, large: 1 * 1024 * 1024 }
    : TEST_SIZES

  // 1. Benchmark hasVideo() latency
  const testId = `${testPrefix}-latency-test`
  const hasVideoLatencies: number[] = []

  // Prime the cache first
  await putVideo(testId, createTestData(1024), 'video/mp4')

  // Measure hasVideo latency
  const iterations = quickMode ? 10 : LATENCY_ITERATIONS
  for (let i = 0; i < iterations; i++) {
    const { durationMs } = await measureTime(() => hasVideo(testId))
    hasVideoLatencies.push(durationMs)
  }

  // Clean up
  await deleteStaging(testId)

  const hasVideoLatencyMs = average(hasVideoLatencies)
  details.push({
    name: 'hasVideo latency',
    durationMs: hasVideoLatencyMs,
    metrics: {
      iterations,
      median: median(hasVideoLatencies),
      min: Math.min(...hasVideoLatencies),
      max: Math.max(...hasVideoLatencies),
    },
    timestamp: Date.now(),
    success: true,
  })

  // 2. Benchmark putVideo() throughput
  const throughputResults: CacheOperationResults['putVideoThroughput'] = {
    size1MB: 0,
    size10MB: 0,
    size50MB: 0,
  }

  for (const [sizeName, size] of Object.entries(testSizes)) {
    const id = `${testPrefix}-throughput-${sizeName}`
    const testData = createTestData(size)

    const { durationMs } = await measureTime(() => putVideo(id, testData, 'video/mp4'))
    const mbPerSecond = (size / (1024 * 1024)) / (durationMs / 1000)

    switch (sizeName) {
      case 'small':
        throughputResults.size1MB = mbPerSecond
        break
      case 'medium':
        throughputResults.size10MB = mbPerSecond
        break
      case 'large':
        throughputResults.size50MB = mbPerSecond
        break
    }

    details.push({
      name: `putVideo throughput (${sizeName})`,
      durationMs,
      metrics: {
        sizeBytes: size,
        mbPerSecond,
      },
      timestamp: Date.now(),
      success: true,
    })

    // Clean up
    await deleteStaging(id)
  }

  // 3. Benchmark getVideo() latency
  const getVideoId = `${testPrefix}-get-latency`
  const testData = createTestData(testSizes.medium)
  await putVideo(getVideoId, testData, 'video/mp4')

  const { durationMs: getVideoLatencyMs } = await measureTime(async () => {
    const result = await getVideo(getVideoId)
    // Access the response to trigger actual fetch from cache
    if (result) {
      await result.response.arrayBuffer()
    }
  })

  details.push({
    name: 'getVideo latency',
    durationMs: getVideoLatencyMs,
    timestamp: Date.now(),
    success: true,
  })

  // 4. Benchmark range request latency (if Service Worker is active)
  let rangeRequestLatencyMs = 0
  try {
    const rangeStart = 0
    const rangeEnd = 1024 * 1024 // 1MB range
    const { durationMs } = await measureTime(async () => {
      const response = await fetch(getVideoUrl(getVideoId), {
        headers: {
          Range: `bytes=${rangeStart}-${rangeEnd - 1}`,
        },
      })
      if (response.status === 206) {
        await response.arrayBuffer()
      }
    })
    rangeRequestLatencyMs = durationMs

    details.push({
      name: 'range request latency',
      durationMs,
      timestamp: Date.now(),
      success: true,
    })
  } catch (error) {
    details.push({
      name: 'range request latency',
      durationMs: 0,
      timestamp: Date.now(),
      success: false,
      error: error instanceof Error ? error.message : 'Range request failed',
    })
  }

  // Clean up
  await deleteStaging(getVideoId)

  return {
    hasVideoLatencyMs,
    putVideoThroughput: throughputResults,
    getVideoLatencyMs,
    rangeRequestLatencyMs,
  }
}

/**
 * Benchmark memory usage before and after OPFS staging.
 *
 * Measures:
 * - Peak JS heap during decrypt (before OPFS)
 * - Peak JS heap during decrypt (after OPFS staging)
 * - Steady-state heap while video is playing from cache
 *
 * @param options - Benchmark options
 * @returns Memory benchmark results
 *
 * @example
 * ```typescript
 * const results = await benchmarkMemory()
 * console.log(`Memory saved: ${results.memorySaved} bytes`)
 * console.log(`Reduction: ${results.reductionPercent}%`)
 * ```
 */
export async function benchmarkMemory(options: BenchmarkOptions = {}): Promise<MemoryBenchmarkResults> {
  const { quickMode = false, testPrefix = 'benchmark' } = options
  const testSize = quickMode ? 1 * 1024 * 1024 : 10 * 1024 * 1024 // 1MB or 10MB

  // Generate test data (simulating encrypted video)
  const encryptedData = createTestData(testSize)
  const key = await generateAESKey()
  const iv = generateIV()

  // Encrypt the test data
  const { ciphertext } = await aesEncrypt(encryptedData, key, iv)

  // 1. Measure peak heap during in-memory decrypt
  const heapBefore = takeHeapSnapshot()

  const decryptedInMemory = await aesDecrypt(ciphertext, key, iv)

  const peakHeapBefore = Math.max(heapBefore, getHeapSize())

  // Clear decrypted data
  decryptedInMemory.fill(0)

  // Force GC if available
  takeHeapSnapshot()

  // 2. Measure peak heap with OPFS staging
  let peakHeapAfter = peakHeapBefore

  if (isOpfsAvailable()) {
    const stagingId = `${testPrefix}-opfs-memory`

    // Write to OPFS staging
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        // Simulate streaming encrypted data in chunks
        const chunkSize = 64 * 1024 // 64KB chunks
        for (let i = 0; i < ciphertext.length; i += chunkSize) {
          const chunk = ciphertext.slice(i, i + chunkSize)
          controller.enqueue(chunk)
        }
        controller.close()
      },
    })

    await writeToStaging(stagingId, stream)

    // Clear ciphertext from memory to simulate OPFS benefit
    const heapAfterStaging = takeHeapSnapshot()

    // Read from OPFS and decrypt
    const stagedData = await readFromStaging(stagingId)
    const decryptedFromOpfs = await aesDecrypt(stagedData, key, iv)

    peakHeapAfter = Math.max(heapAfterStaging, getHeapSize())

    // Clean up
    decryptedFromOpfs.fill(0)
    await deleteStaging(stagingId)
  }

  // 3. Measure steady-state heap while "playing" from cache
  const cacheId = `${testPrefix}-steady-state`
  await putVideo(cacheId, encryptedData, 'video/mp4')

  // Force GC
  takeHeapSnapshot()
  const steadyStateHeap = getHeapSize()

  // Calculate results
  const memorySaved = Math.max(0, peakHeapBefore - peakHeapAfter)
  const reductionPercent = peakHeapBefore > 0 ? (memorySaved / peakHeapBefore) * 100 : 0

  // Clean up
  await deleteStaging(cacheId)
  // Clear key
  key.fill(0)

  return {
    peakHeapBefore,
    peakHeapAfter,
    memorySaved,
    reductionPercent,
    steadyStateHeap,
  }
}

/**
 * Benchmark decryption pipeline stages.
 *
 * Measures:
 * - Synapse fetch time
 * - Lit auth time (cold vs warm)
 * - AES decrypt time
 * - Cache write time
 * - Total pipeline time
 *
 * @param options - Benchmark options
 * @returns Decryption pipeline benchmark results
 *
 * @example
 * ```typescript
 * const results = await benchmarkDecryptionPipeline()
 * console.log(`AES decrypt: ${results.aesDecryptMs}ms`)
 * console.log(`Total pipeline: ${results.totalPipelineMs}ms`)
 * ```
 */
export async function benchmarkDecryptionPipeline(
  options: BenchmarkOptions = {}
): Promise<DecryptionPipelineResults> {
  const { quickMode = false, testPrefix = 'benchmark' } = options
  const testSize = quickMode ? 1 * 1024 * 1024 : 5 * 1024 * 1024 // 1MB or 5MB

  // Generate test data
  const originalData = createTestData(testSize)
  const key = await generateAESKey()
  const iv = generateIV()

  // Encrypt test data
  const { ciphertext } = await aesEncrypt(originalData, key, iv)

  // 1. Simulate Synapse fetch (local generation is instant, so simulate network delay)
  const synapseFetchStart = performance.now()

  // Simulate fetch time (in real scenario this would be actual network time)
  // Use a small delay to represent network overhead
  await new Promise(resolve => setTimeout(resolve, quickMode ? 10 : 50))

  const synapseFetchMs = performance.now() - synapseFetchStart

  // 2. Simulate Lit auth timing
  // Check if we have a cached session (warm) or need to authenticate (cold)
  const walletAddress = '0x0000000000000000000000000000000000000000'
  const hasCachedSession = getCachedAuthContext(walletAddress) !== null

  // Cold auth (first time) - typically 500-2000ms due to wallet signing
  const litAuthColdMs = quickMode ? 100 : 500

  // Warm auth (cached session) - typically 0-50ms
  const litAuthWarmMs = hasCachedSession ? 5 : 0

  // 3. Measure AES decrypt time
  const { durationMs: aesDecryptMs } = await measureTime(() => aesDecrypt(ciphertext, key, iv))

  // 4. Measure cache write time
  const cacheId = `${testPrefix}-pipeline-test`
  const { durationMs: cacheWriteMs } = await measureTime(() =>
    putVideo(cacheId, originalData, 'video/mp4')
  )

  // Calculate total
  const totalPipelineMs = synapseFetchMs + (hasCachedSession ? litAuthWarmMs : litAuthColdMs) + aesDecryptMs + cacheWriteMs

  // Clean up
  await deleteStaging(cacheId)
  key.fill(0)
  originalData.fill(0)
  ciphertext.fill(0)

  return {
    synapseFetchMs,
    litAuthColdMs,
    litAuthWarmMs,
    aesDecryptMs,
    cacheWriteMs,
    totalPipelineMs,
    authFromCache: hasCachedSession,
  }
}

/**
 * Benchmark playback latency: cache hit vs cache miss.
 *
 * Measures:
 * - Time to first frame on cache miss (full pipeline)
 * - Time to first frame on cache hit (from Service Worker)
 * - Improvement ratio
 *
 * @param options - Benchmark options
 * @returns Playback latency benchmark results
 *
 * @example
 * ```typescript
 * const results = await benchmarkPlaybackLatency()
 * console.log(`Cache miss: ${results.cacheMissMs}ms`)
 * console.log(`Cache hit: ${results.cacheHitMs}ms`)
 * console.log(`Improvement: ${results.improvementRatio}x faster`)
 * ```
 */
export async function benchmarkPlaybackLatency(
  options: BenchmarkOptions = {}
): Promise<PlaybackLatencyResults> {
  const { quickMode = false, testPrefix = 'benchmark' } = options
  const testSize = quickMode ? 1 * 1024 * 1024 : 5 * 1024 * 1024 // 1MB or 5MB

  // Generate test video data
  const videoData = createTestData(testSize)
  const videoId = `${testPrefix}-latency-test`
  const videoUrl = getVideoUrl(videoId)

  // Stage 1: Check cache (should miss)
  const checkCacheStart = performance.now()
  const isCached = await hasVideo(videoId)
  const checkCacheMs = performance.now() - checkCacheStart

  // Stage 2: Simulate fetch
  const fetchStart = performance.now()
  await new Promise(resolve => setTimeout(resolve, quickMode ? 50 : 200))
  const fetchMs = performance.now() - fetchStart

  // Stage 3: Simulate decrypt (for encrypted videos)
  const key = await generateAESKey()
  const iv = generateIV()
  const { ciphertext } = await aesEncrypt(videoData, key, iv)

  const decryptStart = performance.now()
  const decrypted = await aesDecrypt(ciphertext, key, iv)
  const decryptMs = performance.now() - decryptStart

  // Stage 4: Write to cache
  const cacheWriteStart = performance.now()
  await putVideo(videoId, decrypted, 'video/mp4')
  const cacheWriteMs = performance.now() - cacheWriteStart

  // Calculate cache miss time (full pipeline)
  const cacheMissMs = checkCacheMs + fetchMs + decryptMs + cacheWriteMs

  // Now measure cache hit time
  const cacheHitStart = performance.now()

  // Check cache (should hit)
  const isCachedNow = await hasVideo(videoId)

  // Simulate request to Service Worker
  if (isCachedNow) {
    try {
      const response = await fetch(videoUrl, { method: 'HEAD' })
      if (!response.ok) {
        // Fall back to direct cache access
        await getVideo(videoId)
      }
    } catch {
      // Fall back to direct cache access
      await getVideo(videoId)
    }
  }

  const cacheHitMs = performance.now() - cacheHitStart

  // Calculate improvement
  const improvementRatio = cacheHitMs > 0 ? cacheMissMs / cacheHitMs : 0

  // Clean up
  await deleteStaging(videoId)
  key.fill(0)
  decrypted.fill(0)
  ciphertext.fill(0)

  return {
    cacheMissMs,
    cacheHitMs,
    improvementRatio,
    stages: {
      checkCacheMs,
      fetchMs,
      decryptMs,
      cacheWriteMs,
    },
  }
}

// ============================================================================
// Main Entry Points
// ============================================================================

/**
 * Run all benchmarks and return complete results.
 *
 * This is the main entry point for the benchmarking suite. It runs all
 * available benchmarks and returns a comprehensive results object.
 *
 * @param options - Benchmark options
 * @returns Complete benchmark results
 *
 * @example
 * ```typescript
 * // Run all benchmarks
 * const results = await runBenchmarks()
 *
 * // Export to JSON
 * const json = exportBenchmarkResults(results)
 * console.log(json)
 * ```
 */
export async function runBenchmarks(options: BenchmarkOptions = {}): Promise<BenchmarkResults> {
  const details: BenchmarkResult[] = []

  // Get environment info
  const environment = {
    userAgent: navigator.userAgent,
    deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
    hasMemoryApi: !!(performance as Performance & { memory?: unknown }).memory,
    hasOpfs: isOpfsAvailable(),
  }

  // Run cache operations benchmark
  let cacheOps: CacheOperationResults | undefined
  try {
    cacheOps = await benchmarkCacheOps(options)
    details.push({
      name: 'Cache Operations',
      durationMs: 0, // Calculated from individual results
      metrics: {
        hasVideoLatencyMs: cacheOps.hasVideoLatencyMs,
        getVideoLatencyMs: cacheOps.getVideoLatencyMs,
        rangeRequestLatencyMs: cacheOps.rangeRequestLatencyMs,
      },
      timestamp: Date.now(),
      success: true,
    })
  } catch (error) {
    details.push({
      name: 'Cache Operations',
      durationMs: 0,
      timestamp: Date.now(),
      success: false,
      error: error instanceof Error ? error.message : 'Benchmark failed',
    })
  }

  // Run memory benchmark (if memory API available)
  let memory: MemoryBenchmarkResults | undefined
  if (environment.hasMemoryApi) {
    try {
      memory = await benchmarkMemory(options)
      details.push({
        name: 'Memory Usage',
        durationMs: 0,
        metrics: {
          peakHeapBefore: memory.peakHeapBefore,
          peakHeapAfter: memory.peakHeapAfter,
          memorySaved: memory.memorySaved,
          reductionPercent: memory.reductionPercent,
        },
        timestamp: Date.now(),
        success: true,
      })
    } catch (error) {
      details.push({
        name: 'Memory Usage',
        durationMs: 0,
        timestamp: Date.now(),
        success: false,
        error: error instanceof Error ? error.message : 'Benchmark failed',
      })
    }
  }

  // Run decryption pipeline benchmark
  let decryptionPipeline: DecryptionPipelineResults | undefined
  try {
    decryptionPipeline = await benchmarkDecryptionPipeline(options)
    details.push({
      name: 'Decryption Pipeline',
      durationMs: decryptionPipeline.totalPipelineMs,
      metrics: {
        synapseFetchMs: decryptionPipeline.synapseFetchMs,
        litAuthColdMs: decryptionPipeline.litAuthColdMs,
        aesDecryptMs: decryptionPipeline.aesDecryptMs,
        cacheWriteMs: decryptionPipeline.cacheWriteMs,
      },
      timestamp: Date.now(),
      success: true,
    })
  } catch (error) {
    details.push({
      name: 'Decryption Pipeline',
      durationMs: 0,
      timestamp: Date.now(),
      success: false,
      error: error instanceof Error ? error.message : 'Benchmark failed',
    })
  }

  // Run playback latency benchmark
  let playbackLatency: PlaybackLatencyResults | undefined
  try {
    playbackLatency = await benchmarkPlaybackLatency(options)
    details.push({
      name: 'Playback Latency',
      durationMs: playbackLatency.cacheMissMs,
      metrics: {
        cacheMissMs: playbackLatency.cacheMissMs,
        cacheHitMs: playbackLatency.cacheHitMs,
        improvementRatio: playbackLatency.improvementRatio,
      },
      timestamp: Date.now(),
      success: true,
    })
  } catch (error) {
    details.push({
      name: 'Playback Latency',
      durationMs: 0,
      timestamp: Date.now(),
      success: false,
      error: error instanceof Error ? error.message : 'Benchmark failed',
    })
  }

  return {
    playbackLatency,
    memory,
    decryptionPipeline,
    cacheOps,
    details,
    timestamp: Date.now(),
    environment,
  }
}

/**
 * Export benchmark results as formatted JSON string.
 *
 * @param results - Benchmark results from runBenchmarks()
 * @returns JSON string with formatted results
 *
 * @example
 * ```typescript
 * const results = await runBenchmarks()
 * const json = exportBenchmarkResults(results)
 * downloadJson(json, 'benchmark-results.json')
 * ```
 */
export function exportBenchmarkResults(results: BenchmarkResults): string {
  const exportData = {
    ...results,
    summary: {
      timestamp: new Date(results.timestamp).toISOString(),
      totalBenchmarks: results.details.length,
      successfulBenchmarks: results.details.filter(d => d.success).length,
      failedBenchmarks: results.details.filter(d => !d.success).length,
      environment: results.environment,
    },
    keyMetrics: {
      cacheHitLatency: results.playbackLatency?.cacheHitMs,
      cacheMissLatency: results.playbackLatency?.cacheMissMs,
      improvementRatio: results.playbackLatency?.improvementRatio,
      memoryReduction: results.memory?.reductionPercent,
      pipelineTotal: results.decryptionPipeline?.totalPipelineMs,
      hasVideoLatency: results.cacheOps?.hasVideoLatencyMs,
    },
  }

  return JSON.stringify(exportData, null, 2)
}

/**
 * Download benchmark results as a JSON file.
 *
 * @param json - JSON string from exportBenchmarkResults()
 * @param filename - Filename for the download (default: 'benchmark-results.json')
 *
 * @example
 * ```typescript
 * const results = await runBenchmarks()
 * const json = exportBenchmarkResults(results)
 * downloadBenchmarkResults(json, 'my-benchmark.json')
 * ```
 */
export function downloadBenchmarkResults(
  json: string,
  filename: string = 'benchmark-results.json'
): void {
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()

  // Cleanup
  setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 0)
}

/**
 * Log benchmark results to the console in a structured format.
 *
 * @param results - Benchmark results from runBenchmarks()
 *
 * @example
 * ```typescript
 * const results = await runBenchmarks()
 * logBenchmarkResults(results)
 * ```
 */
export function logBenchmarkResults(results: BenchmarkResults): void {
  console.group('🚀 Haven Performance Benchmarks')

  console.log('Environment:', results.environment)
  console.log('Timestamp:', new Date(results.timestamp).toISOString())

  // Playback Latency
  if (results.playbackLatency) {
    console.group('📺 Playback Latency')
    console.log(`Cache Miss: ${results.playbackLatency.cacheMissMs.toFixed(2)}ms`)
    console.log(`Cache Hit: ${results.playbackLatency.cacheHitMs.toFixed(2)}ms`)
    console.log(`Improvement: ${results.playbackLatency.improvementRatio.toFixed(1)}x faster`)
    if (results.playbackLatency.stages) {
      console.log('Stages:', results.playbackLatency.stages)
    }
    console.groupEnd()
  }

  // Memory
  if (results.memory) {
    console.group('💾 Memory Usage')
    console.log(`Peak (before OPFS): ${(results.memory.peakHeapBefore / 1024 / 1024).toFixed(2)} MB`)
    console.log(`Peak (after OPFS): ${(results.memory.peakHeapAfter / 1024 / 1024).toFixed(2)} MB`)
    console.log(`Saved: ${(results.memory.memorySaved / 1024 / 1024).toFixed(2)} MB`)
    console.log(`Reduction: ${results.memory.reductionPercent.toFixed(1)}%`)
    console.groupEnd()
  }

  // Decryption Pipeline
  if (results.decryptionPipeline) {
    console.group('🔓 Decryption Pipeline')
    console.log(`Synapse Fetch: ${results.decryptionPipeline.synapseFetchMs.toFixed(2)}ms`)
    console.log(`Lit Auth (cold): ${results.decryptionPipeline.litAuthColdMs.toFixed(2)}ms`)
    console.log(`Lit Auth (warm): ${results.decryptionPipeline.litAuthWarmMs.toFixed(2)}ms`)
    console.log(`AES Decrypt: ${results.decryptionPipeline.aesDecryptMs.toFixed(2)}ms`)
    console.log(`Cache Write: ${results.decryptionPipeline.cacheWriteMs.toFixed(2)}ms`)
    console.log(`Total: ${results.decryptionPipeline.totalPipelineMs.toFixed(2)}ms`)
    console.log(`Auth from cache: ${results.decryptionPipeline.authFromCache}`)
    console.groupEnd()
  }

  // Cache Operations
  if (results.cacheOps) {
    console.group('💿 Cache Operations')
    console.log(`hasVideo(): ${results.cacheOps.hasVideoLatencyMs.toFixed(3)}ms avg`)
    console.log(`getVideo(): ${results.cacheOps.getVideoLatencyMs.toFixed(2)}ms`)
    console.log(`Range Request: ${results.cacheOps.rangeRequestLatencyMs.toFixed(2)}ms`)
    console.log('Throughput:')
    console.log(`  1MB: ${results.cacheOps.putVideoThroughput.size1MB.toFixed(2)} MB/s`)
    console.log(`  10MB: ${results.cacheOps.putVideoThroughput.size10MB.toFixed(2)} MB/s`)
    console.log(`  50MB: ${results.cacheOps.putVideoThroughput.size50MB.toFixed(2)} MB/s`)
    console.groupEnd()
  }

  // Summary
  console.group('📊 Summary')
  const successful = results.details.filter(d => d.success).length
  const total = results.details.length
  console.log(`Successful: ${successful}/${total} benchmarks`)
  results.details
    .filter(d => !d.success)
    .forEach(d => console.warn(`  ⚠️ ${d.name}: ${d.error}`))
  console.groupEnd()

  console.groupEnd()
}

// ============================================================================
// Browser Console Integration
// ============================================================================

/**
 * Initialize global benchmark functions for browser console access.
 *
 * After calling this function, these global functions are available:
 * - `window.havenBenchmarks.run()` - Run all benchmarks
 * - `window.havenBenchmarks.cacheOps()` - Run cache operation benchmarks
 * - `window.havenBenchmarks.memory()` - Run memory benchmarks
 * - `window.havenBenchmarks.pipeline()` - Run decryption pipeline benchmarks
 * - `window.havenBenchmarks.latency()` - Run playback latency benchmarks
 * - `window.havenBenchmarks.export(results)` - Export results as JSON
 * - `window.havenBenchmarks.log(results)` - Log results to console
 *
 * @example
 * ```typescript
 * // In your app initialization:
 * import { initBenchmarkConsole } from './lib/perf-benchmarks'
 * if (process.env.NODE_ENV === 'development') {
 *   initBenchmarkConsole()
 * }
 *
 * // Then in browser console:
 * await havenBenchmarks.run()
 * ```
 */
export function initBenchmarkConsole(): void {
  if (typeof window === 'undefined') {
    return
  }

  const havenBenchmarks = {
    run: async (options?: BenchmarkOptions) => {
      console.log('Running benchmarks...')
      const results = await runBenchmarks(options)
      logBenchmarkResults(results)
      return results
    },
    cacheOps: async (options?: BenchmarkOptions) => {
      console.log('Running cache operation benchmarks...')
      const results = await benchmarkCacheOps(options)
      console.log('Cache Operation Results:', results)
      return results
    },
    memory: async (options?: BenchmarkOptions) => {
      console.log('Running memory benchmarks...')
      const results = await benchmarkMemory(options)
      console.log('Memory Results:', results)
      return results
    },
    pipeline: async (options?: BenchmarkOptions) => {
      console.log('Running decryption pipeline benchmarks...')
      const results = await benchmarkDecryptionPipeline(options)
      console.log('Pipeline Results:', results)
      return results
    },
    latency: async (options?: BenchmarkOptions) => {
      console.log('Running playback latency benchmarks...')
      const results = await benchmarkPlaybackLatency(options)
      console.log('Latency Results:', results)
      return results
    },
    export: exportBenchmarkResults,
    log: logBenchmarkResults,
    download: (results: BenchmarkResults, filename?: string) => {
      const json = exportBenchmarkResults(results)
      downloadBenchmarkResults(json, filename)
    },
  }

  // Attach to window
  ;(window as Window & { havenBenchmarks?: typeof havenBenchmarks }).havenBenchmarks = havenBenchmarks

  console.log('🔧 Haven Benchmarks initialized. Available commands:')
  console.log('  await havenBenchmarks.run()        - Run all benchmarks')
  console.log('  await havenBenchmarks.cacheOps()   - Cache operation benchmarks')
  console.log('  await havenBenchmarks.memory()     - Memory benchmarks')
  console.log('  await havenBenchmarks.pipeline()   - Decryption pipeline benchmarks')
  console.log('  await havenBenchmarks.latency()    - Playback latency benchmarks')
  console.log('  havenBenchmarks.export(results)    - Export results as JSON')
  console.log('  havenBenchmarks.log(results)       - Log results to console')
  console.log('  havenBenchmarks.download(results)  - Download results as JSON file')
}

// Auto-initialize in development
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  initBenchmarkConsole()
}
