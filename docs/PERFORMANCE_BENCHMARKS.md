# Performance Benchmarks

A comprehensive benchmarking suite for measuring the performance improvements from the Haven video caching system.

## Overview

The benchmarking suite provides concrete metrics for:

1. **Playback Latency**: Time to first frame (cache hit vs miss)
2. **Memory Usage**: Peak JS heap during decryption (before/after OPFS)
3. **Decryption Pipeline**: Individual stage timings
4. **Cache Operations**: hasVideo, putVideo, getVideo latencies

## Usage

### Running from Browser Console

In development mode, the benchmarks are automatically available via the global `havenBenchmarks` object:

```javascript
// Run all benchmarks
await havenBenchmarks.run()

// Run specific benchmarks
await havenBenchmarks.cacheOps()     // Cache operations
await havenBenchmarks.memory()       // Memory benchmarks
await havenBenchmarks.pipeline()     // Decryption pipeline
await havenBenchmarks.latency()      // Playback latency

// Export results
const results = await havenBenchmarks.run()
havenBenchmarks.export(results)      // Returns JSON string
havenBenchmarks.download(results)    // Downloads as JSON file
```

### Programmatic Usage

```typescript
import {
  runBenchmarks,
  benchmarkCacheOps,
  benchmarkMemory,
  benchmarkDecryptionPipeline,
  benchmarkPlaybackLatency,
  exportBenchmarkResults,
  logBenchmarkResults,
} from '@/lib/perf-benchmarks'

// Run all benchmarks
const results = await runBenchmarks()

// Run with options
const results = await runBenchmarks({
  quickMode: true,        // Use smaller test data
  testPrefix: 'my-test',  // Custom prefix for test data
})

// Log results to console
logBenchmarkResults(results)

// Export as JSON
const json = exportBenchmarkResults(results)
```

## Benchmark Details

### Playback Latency

Measures the time from clicking play to the first frame being displayed.

| Metric | Description |
|--------|-------------|
| `cacheMissMs` | Full pipeline: fetch → decrypt → cache → play |
| `cacheHitMs` | Direct from Service Worker cache |
| `improvementRatio` | How many times faster cache hit is vs miss |
| `stages` | Individual stage timings for cache miss |

**Target**: Cache hit should be <100ms

### Memory Usage

Measures JavaScript heap usage during video decryption.

| Metric | Description |
|--------|-------------|
| `peakHeapBefore` | Peak memory without OPFS staging |
| `peakHeapAfter` | Peak memory with OPFS staging |
| `memorySaved` | Bytes saved by using OPFS |
| `reductionPercent` | Percentage reduction in peak memory |
| `steadyStateHeap` | Memory while playing from cache |

**Expected**: OPFS staging should reduce peak memory by ~30-40%

### Decryption Pipeline

Measures individual stages of the decryption process.

| Metric | Description |
|--------|-------------|
| `synapseFetchMs` | Time to fetch encrypted data from Filecoin |
| `litAuthColdMs` | First authentication (requires wallet signature) |
| `litAuthWarmMs` | Cached session reuse |
| `aesDecryptMs` | AES-256-GCM decryption time |
| `cacheWriteMs` | Writing decrypted data to Cache API |
| `totalPipelineMs` | Sum of all stages |
| `authFromCache` | Whether auth was served from cache |

**Expected**: Warm auth should be ~100x faster than cold auth

### Cache Operations

Measures the performance of cache API operations.

| Metric | Description |
|--------|-------------|
| `hasVideoLatencyMs` | Average latency over 100 calls |
| `putVideoThroughput.size1MB` | MB/s for 1MB files |
| `putVideoThroughput.size10MB` | MB/s for 10MB files |
| `putVideoThroughput.size50MB` | MB/s for 50MB files |
| `getVideoLatencyMs` | Time to first byte from cache |
| `rangeRequestLatencyMs` | Time for 206 response from SW |

## Example Output

```json
{
  "playbackLatency": {
    "cacheMissMs": 2500,
    "cacheHitMs": 45,
    "improvementRatio": 55.6,
    "stages": {
      "checkCacheMs": 5,
      "fetchMs": 800,
      "decryptMs": 1200,
      "cacheWriteMs": 495
    }
  },
  "memory": {
    "peakHeapBefore": 157286400,
    "peakHeapAfter": 104857600,
    "memorySaved": 52428800,
    "reductionPercent": 33.3,
    "steadyStateHeap": 52428800
  },
  "decryptionPipeline": {
    "synapseFetchMs": 800,
    "litAuthColdMs": 1500,
    "litAuthWarmMs": 10,
    "aesDecryptMs": 1200,
    "cacheWriteMs": 500,
    "totalPipelineMs": 4000,
    "authFromCache": false
  },
  "cacheOps": {
    "hasVideoLatencyMs": 0.12,
    "putVideoThroughput": {
      "size1MB": 150.5,
      "size10MB": 120.3,
      "size50MB": 95.8
    },
    "getVideoLatencyMs": 8.5,
    "rangeRequestLatencyMs": 15.2
  }
}
```

## Development Notes

- Benchmarks are designed to run in the browser environment
- Some benchmarks require the Service Worker to be active
- OPFS benchmarks only work in browsers that support the Origin Private File System API (Chrome 86+, Edge 86+, Firefox 111+)
- Memory benchmarks require the `performance.memory` API (Chrome only)
- Use `quickMode: true` for faster test runs during development

## Implementation Location

- **Source**: `src/lib/perf-benchmarks.ts`
- **Tests**: `src/lib/__tests__/perf-benchmarks.test.ts`
- **Exports**: Added to `src/lib/index.ts`
