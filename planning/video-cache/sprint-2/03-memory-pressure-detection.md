# Task 2.3: Memory Pressure Detection & Adaptive Strategy

## Objective

Implement runtime memory pressure detection to dynamically choose between in-memory and OPFS-staged decryption pipelines. On constrained devices, automatically use the memory-efficient path; on powerful desktops, use the faster in-memory path.

## Background

Not all devices are equal. A desktop with 32GB RAM can comfortably decrypt a 500MB video entirely in memory. A mobile phone with 3GB RAM cannot. Rather than always using the slower OPFS path or always risking OOM crashes, we should detect the device's capabilities and choose the optimal strategy.

## Requirements

### Memory Detection (`src/lib/memory-detect.ts`)

1. **`getMemoryInfo()`** — Gather device memory information
   - Use `navigator.deviceMemory` (Chrome/Edge) for total RAM estimate
   - Use `performance.memory` (Chrome) for current JS heap usage
   - Estimate available memory from the above
   - Return a structured `MemoryInfo` object

2. **`getDecryptionStrategy(fileSize)`** — Choose optimal decryption path
   - Based on file size and available memory, return one of:
     - `'in-memory'` — Fast path, everything in JS heap
     - `'opfs-staged'` — Memory-efficient path via OPFS
     - `'too-large'` — File exceeds all available strategies
   - Include reasoning for the choice (for debugging/logging)

3. **`shouldWarnUser(fileSize)`** — Determine if a warning should be shown
   - Return `true` if the file is large relative to available memory
   - Include suggested message

### Strategy Thresholds

```typescript
interface DecryptionStrategy {
  mode: 'in-memory' | 'opfs-staged' | 'too-large'
  reason: string
  estimatedPeakMemory: number // bytes
  estimatedAvailableMemory: number // bytes
  warningMessage?: string
}

// Decision logic:
// - If fileSize * 3 < availableMemory → 'in-memory' (fast path)
// - If fileSize * 2 < availableMemory && OPFS available → 'opfs-staged'
// - If fileSize * 2 < availableMemory && no OPFS → 'in-memory' with warning
// - Otherwise → 'too-large'
```

### Memory Info Type

```typescript
interface MemoryInfo {
  /** Total device memory in bytes (from navigator.deviceMemory, 0 if unavailable) */
  deviceMemory: number
  
  /** Current JS heap size in bytes (from performance.memory, 0 if unavailable) */
  jsHeapUsed: number
  
  /** JS heap size limit in bytes (0 if unavailable) */
  jsHeapLimit: number
  
  /** Estimated available memory for decryption */
  estimatedAvailable: number
  
  /** Whether memory APIs are available */
  hasMemoryApi: boolean
  
  /** Whether this is likely a constrained device */
  isConstrained: boolean
}
```

## Implementation Details

### Memory Detection

```typescript
// src/lib/memory-detect.ts

export function getMemoryInfo(): MemoryInfo {
  const deviceMemoryGB = (navigator as any).deviceMemory || 0
  const deviceMemory = deviceMemoryGB * 1024 * 1024 * 1024
  
  // Chrome-only: performance.memory
  const perfMemory = (performance as any).memory
  const jsHeapUsed = perfMemory?.usedJSHeapSize || 0
  const jsHeapLimit = perfMemory?.jsHeapSizeLimit || 0
  
  // Estimate available memory
  let estimatedAvailable: number
  
  if (jsHeapLimit > 0) {
    // Best case: we know the heap limit
    estimatedAvailable = jsHeapLimit - jsHeapUsed
  } else if (deviceMemory > 0) {
    // Rough estimate: assume 50% of device memory is available for JS
    estimatedAvailable = deviceMemory * 0.5
  } else {
    // No info: assume 512MB available (conservative)
    estimatedAvailable = 512 * 1024 * 1024
  }
  
  // Detect constrained devices
  const isConstrained = 
    deviceMemoryGB > 0 && deviceMemoryGB <= 4 || // 4GB or less
    /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
  
  return {
    deviceMemory,
    jsHeapUsed,
    jsHeapLimit,
    estimatedAvailable,
    hasMemoryApi: jsHeapLimit > 0 || deviceMemory > 0,
    isConstrained,
  }
}
```

### Strategy Selection

```typescript
import { isOpfsAvailable } from './opfs'

export function getDecryptionStrategy(fileSize: number): DecryptionStrategy {
  const memory = getMemoryInfo()
  
  // Multiplier: encrypted + decrypted + overhead
  const inMemoryPeak = fileSize * 3  // encrypted + decrypted + blob
  const opfsStagedPeak = fileSize * 2 // read from disk + decrypted
  
  // Fast path: plenty of memory
  if (inMemoryPeak < memory.estimatedAvailable * 0.7) {
    return {
      mode: 'in-memory',
      reason: `File (${formatBytes(fileSize)}) fits comfortably in memory`,
      estimatedPeakMemory: inMemoryPeak,
      estimatedAvailableMemory: memory.estimatedAvailable,
    }
  }
  
  // OPFS path: moderate memory pressure
  if (opfsStagedPeak < memory.estimatedAvailable * 0.8 && isOpfsAvailable()) {
    return {
      mode: 'opfs-staged',
      reason: `File (${formatBytes(fileSize)}) too large for in-memory, using OPFS staging`,
      estimatedPeakMemory: opfsStagedPeak,
      estimatedAvailableMemory: memory.estimatedAvailable,
      warningMessage: memory.isConstrained 
        ? 'This is a large file. Decryption may take longer on this device.'
        : undefined,
    }
  }
  
  // In-memory with warning (no OPFS available)
  if (opfsStagedPeak < memory.estimatedAvailable * 0.9) {
    return {
      mode: 'in-memory',
      reason: `OPFS not available, using in-memory with warning`,
      estimatedPeakMemory: inMemoryPeak,
      estimatedAvailableMemory: memory.estimatedAvailable,
      warningMessage: 'This file is large and may cause performance issues on this device.',
    }
  }
  
  // Too large
  return {
    mode: 'too-large',
    reason: `File (${formatBytes(fileSize)}) exceeds available memory (${formatBytes(memory.estimatedAvailable)})`,
    estimatedPeakMemory: opfsStagedPeak,
    estimatedAvailableMemory: memory.estimatedAvailable,
    warningMessage: 'This file is too large to decrypt on this device.',
  }
}
```

### Integration with `useVideoCache`

```typescript
// In useVideoCache hook
const strategy = getDecryptionStrategy(encryptedData.byteLength)

if (strategy.mode === 'too-large') {
  setError(new Error(strategy.warningMessage || 'File too large'))
  return
}

if (strategy.warningMessage) {
  // Show warning to user but continue
  setWarning(strategy.warningMessage)
}

if (strategy.mode === 'opfs-staged') {
  // Use OPFS pipeline (Task 2.1)
} else {
  // Use in-memory pipeline
}
```

## Acceptance Criteria

- [ ] `getMemoryInfo()` returns device memory information using available APIs
- [ ] `getDecryptionStrategy()` returns appropriate strategy based on file size and memory
- [ ] Strategy correctly chooses `'in-memory'` for small files on capable devices
- [ ] Strategy correctly chooses `'opfs-staged'` for large files on constrained devices
- [ ] Strategy returns `'too-large'` when file exceeds all available strategies
- [ ] Warning messages are appropriate and user-friendly
- [ ] Graceful behavior when memory APIs are unavailable (conservative defaults)
- [ ] `isConstrained` correctly identifies mobile devices
- [ ] Integration point with `useVideoCache` is documented

## Dependencies

- Task 2.1 (OPFS Staging)

## Estimated Effort

Small-Medium (3-4 hours)