# Task 6.3: Performance Benchmarks

## Objective

Create a benchmarking suite that measures the performance improvements from the caching system, providing concrete metrics for memory usage, playback latency, and decryption time.

## Benchmarks

### 1. Playback Latency

| Metric | How to Measure |
|--------|---------------|
| Time to first frame (cache miss) | `performance.mark()` from click to `<video>.oncanplay` |
| Time to first frame (cache hit) | Same measurement, should be <100ms |

### 2. Memory Usage

| Metric | How to Measure |
|--------|---------------|
| Peak JS heap during decrypt (before) | `performance.memory.usedJSHeapSize` snapshots |
| Peak JS heap during decrypt (after) | Same, with OPFS staging |
| Steady-state heap (cached) | Heap size while video is playing via SW from cache |

### 3. Decryption Pipeline

| Metric | How to Measure |
|--------|---------------|
| Synapse fetch time | `performance.mark()` around fetch |
| Lit auth time (cold) | First auth in session |
| Lit auth time (warm) | Cached session reuse |
| AES decrypt time | `performance.mark()` around decrypt |
| Cache write time | `performance.mark()` around `putVideo()` |
| Total pipeline time | Sum of above |

### 4. Cache Operations

| Metric | How to Measure |
|--------|---------------|
| `hasVideo()` latency | Average over 100 calls |
| `putVideo()` throughput | MB/s for various file sizes |
| `getVideo()` latency | Time to first byte from cache |
| Range request latency | Time for 206 response from SW |

## Implementation

```typescript
// src/lib/perf-benchmarks.ts (development only)

export async function runBenchmarks(): Promise<BenchmarkResults> {
  const results: BenchmarkResults = {}
  
  // Cache operation benchmarks
  results.cacheOps = await benchmarkCacheOps()
  
  // Memory benchmarks (if performance.memory available)
  if ((performance as any).memory) {
    results.memory = await benchmarkMemory()
  }
  
  return results
}
```

## Acceptance Criteria

- [ ] Benchmark suite measures playback latency for cache hit vs miss
- [ ] Memory usage is measured before and after OPFS staging
- [ ] Decryption pipeline stages are individually timed
- [ ] Cache operation latencies are measured
- [ ] Results are logged in a structured format
- [ ] Benchmarks can be run from browser console in development
- [ ] Results can be exported as JSON for comparison

## Dependencies

- All Sprint 1-5 tasks

## Estimated Effort

Medium (4-6 hours)