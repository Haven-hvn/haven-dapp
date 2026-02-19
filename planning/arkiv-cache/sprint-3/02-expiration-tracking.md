# Task 3.2 — Entity Expiration Tracking & Block Monitoring

**Sprint:** 3 — Sync & Resilience  
**Estimate:** 3–4 hours  
**Files:** `src/lib/cache/expirationTracker.ts` (new), `src/services/videoService.ts` (modify)

## Objective

Implement proactive expiration tracking by monitoring Arkiv block numbers and comparing them against entity `expiresAtBlock` values. Instead of only discovering expired entities during sync, the system should predict upcoming expirations and notify the user before their data disappears from the chain.

## Background

Arkiv entities have an `expiresAtBlock` field (from `ArkivSdkEntity`). Currently, this field is not used in the application. By tracking the current block number and comparing it to entity expiration blocks, we can:

1. **Proactively cache** entities that are about to expire
2. **Warn users** about upcoming expirations
3. **Accurately mark** entities as expired without waiting for a failed fetch

## Prerequisites

- Task 3.1 (background sync engine)

## Requirements

### 1. Expiration Tracker

```typescript
// src/lib/cache/expirationTracker.ts

export interface ExpirationInfo {
  videoId: string
  title: string
  expiresAtBlock: number
  estimatedExpirationTime: Date  // Estimated wall-clock time
  blocksRemaining: number
  status: 'safe' | 'expiring-soon' | 'expired'
}

export class ExpirationTracker {
  private currentBlock: number = 0
  private blockTimeSeconds: number = 12  // Default Arkiv block time

  /** Update the current block number */
  setCurrentBlock(blockNumber: number, blockTime?: number): void

  /** Check expiration status for a single video */
  getExpirationInfo(video: CachedVideo): ExpirationInfo | null

  /** Get all videos expiring within N blocks */
  getExpiringSoon(
    videos: CachedVideo[], 
    withinBlocks: number = 7200  // ~24 hours at 12s blocks
  ): ExpirationInfo[]

  /** Get all already-expired videos */
  getExpired(videos: CachedVideo[]): ExpirationInfo[]

  /** Estimate wall-clock time for a future block */
  estimateBlockTime(targetBlock: number): Date
}
```

### 2. Block Number Extraction

Modify the entity parsing to capture `expiresAtBlock`:

```typescript
// In videoService.ts parseArkivEntity, extract expiration block:

// The ArkivSdkEntity has expiresAtBlock as bigint
// Convert to number for storage (safe for block numbers)
const expiresAtBlock = entity.expiresAtBlock 
  ? Number(entity.expiresAtBlock) 
  : undefined
```

Update `CachedVideo` to store this (already defined in Task 1.1):
```typescript
expiresAtBlock?: number
```

### 3. Block Monitoring Integration

Hook into the existing Arkiv connection to get current block:

```typescript
// In syncEngine.ts, during each sync cycle:

async syncOnce(): Promise<CacheSyncResult> {
  // ... existing sync logic ...

  // Also update block number for expiration tracking
  try {
    const blockTiming = await client.getBlockTiming()
    const tracker = getExpirationTracker()
    tracker.setCurrentBlock(
      Number(blockTiming.currentBlock),
      blockTiming.currentBlockTime
    )
  } catch {
    // Non-critical — continue without block update
  }
}
```

### 4. Expiration Status Calculation

```typescript
getExpirationInfo(video: CachedVideo): ExpirationInfo | null {
  if (!video.expiresAtBlock || this.currentBlock === 0) {
    return null
  }

  const blocksRemaining = video.expiresAtBlock - this.currentBlock
  
  let status: 'safe' | 'expiring-soon' | 'expired'
  if (blocksRemaining <= 0) {
    status = 'expired'
  } else if (blocksRemaining <= 7200) { // ~24 hours
    status = 'expiring-soon'
  } else {
    status = 'safe'
  }

  return {
    videoId: video.id,
    title: video.title,
    expiresAtBlock: video.expiresAtBlock,
    estimatedExpirationTime: this.estimateBlockTime(video.expiresAtBlock),
    blocksRemaining: Math.max(0, blocksRemaining),
    status,
  }
}
```

### 5. Expiration Thresholds

Define configurable thresholds:

```typescript
export const EXPIRATION_THRESHOLDS = {
  /** Blocks until "expiring soon" warning (~24 hours at 12s blocks) */
  EXPIRING_SOON_BLOCKS: 7200,
  
  /** Blocks until "critical" warning (~6 hours) */
  CRITICAL_BLOCKS: 1800,
  
  /** Blocks until "imminent" warning (~1 hour) */
  IMMINENT_BLOCKS: 300,
}
```

### 6. Proactive Cache Refresh

When entities are detected as "expiring soon," trigger a targeted cache refresh to ensure we have the latest data before it disappears:

```typescript
async refreshExpiringSoon(walletAddress: string): Promise<void> {
  const cacheService = getVideoCacheService(walletAddress)
  const allCached = await cacheService.getVideos()
  
  // Convert back to CachedVideo to check expiration
  const expiring = this.getExpiringSoon(/* cached videos */)
  
  if (expiring.length === 0) return

  console.info(
    `[ExpirationTracker] ${expiring.length} videos expiring soon, refreshing cache`
  )

  // Fetch fresh data for expiring entities
  for (const info of expiring) {
    try {
      const video = await fetchVideoByIdWithCache(info.videoId, walletAddress)
      if (video) {
        await cacheService.cacheVideo(video)
      }
    } catch {
      // Entity may already be expired — that's okay, we have the cached version
    }
  }
}
```

### 7. Expiration Hook for UI

```typescript
// src/hooks/useExpirationStatus.ts

export function useExpirationStatus() {
  const { address } = useAppKitAccount()
  const [expiringVideos, setExpiringVideos] = useState<ExpirationInfo[]>([])
  const [expiredVideos, setExpiredVideos] = useState<ExpirationInfo[]>([])

  useEffect(() => {
    if (!address) return

    const tracker = getExpirationTracker()
    const cacheService = getVideoCacheService(address)

    async function checkExpirations() {
      const cached = await cacheService.getVideosRaw() // Get CachedVideo[]
      setExpiringVideos(tracker.getExpiringSoon(cached))
      setExpiredVideos(tracker.getExpired(cached))
    }

    checkExpirations()
    // Re-check every minute
    const interval = setInterval(checkExpirations, 60 * 1000)
    return () => clearInterval(interval)
  }, [address])

  return { expiringVideos, expiredVideos }
}
```

## Acceptance Criteria

- [ ] `expiresAtBlock` is extracted from Arkiv entities and stored in cache
- [ ] `ExpirationTracker` correctly calculates expiration status
- [ ] Block time estimation produces reasonable wall-clock times
- [ ] "Expiring soon" detection works with configurable thresholds
- [ ] Proactive cache refresh fetches latest data for expiring entities
- [ ] Block number is updated during each sync cycle
- [ ] `useExpirationStatus` hook provides expiration info to UI
- [ ] Expired entities are automatically marked in cache
- [ ] All calculations handle edge cases (no expiration block, block 0, etc.)

## Testing Notes

- Test with various block numbers and expiration blocks
- Test threshold boundaries (exactly at threshold, one block before/after)
- Test block time estimation accuracy
- Test with entities that have no expiration (should return null)
- Test proactive refresh when entity is already expired on Arkiv