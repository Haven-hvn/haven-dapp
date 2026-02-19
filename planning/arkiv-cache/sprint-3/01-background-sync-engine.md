# Task 3.1 — Background Sync Engine

**Sprint:** 3 — Sync & Resilience  
**Estimate:** 4–5 hours  
**Files:** `src/lib/cache/syncEngine.ts` (new), `src/hooks/useBackgroundSync.ts` (new)

## Objective

Implement a background sync engine that periodically reconciles the local cache with Arkiv. This ensures the cache stays fresh, detects newly expired entities, and picks up any changes made from other devices or sessions.

## Background

Currently, cache sync only happens when the user explicitly loads the library page (via `fetchAllVideos`). If the user keeps the app open for hours, the cache becomes stale. The background sync engine runs on a configurable interval and keeps the cache up-to-date without user interaction.

## Prerequisites

- Sprint 2 fully completed

## Requirements

### 1. Sync Engine Class

```typescript
// src/lib/cache/syncEngine.ts

export class CacheSyncEngine {
  private walletAddress: string
  private intervalId: ReturnType<typeof setInterval> | null = null
  private isRunning: boolean = false
  private syncIntervalMs: number

  constructor(walletAddress: string, syncIntervalMs: number = 5 * 60 * 1000)

  /** Start the background sync loop */
  start(): void

  /** Stop the background sync loop */
  stop(): void

  /** Run a single sync cycle (can be called manually) */
  async syncOnce(): Promise<CacheSyncResult>

  /** Whether the engine is currently running */
  get active(): boolean

  /** Update the sync interval (restarts the loop) */
  setSyncInterval(ms: number): void
}
```

### 2. Sync Cycle Implementation

Each sync cycle:

```typescript
async syncOnce(): Promise<CacheSyncResult> {
  if (this.isRunning) {
    // Prevent concurrent syncs
    return { added: 0, updated: 0, expired: 0, unchanged: 0, errors: ['Sync already in progress'], syncedAt: Date.now() }
  }

  this.isRunning = true
  const cacheStore = useCacheStore.getState()
  cacheStore.setSyncing(true)

  try {
    // 1. Fetch current videos from Arkiv
    const client = getClient()
    const entities = await getAllEntitiesByOwner(client, this.walletAddress)
    const arkivVideos = entities.map(parseArkivEntity)

    // 2. Sync with cache
    const cacheService = getVideoCacheService(this.walletAddress)
    const result = await cacheService.syncWithArkiv(arkivVideos)

    // 3. Update store
    cacheStore.setSyncResult(result)
    const stats = await cacheService.getStats()
    cacheStore.setStats(stats)

    // 4. Log summary
    if (result.added > 0 || result.updated > 0 || result.expired > 0) {
      console.info(
        `[SyncEngine] Sync complete:`,
        `+${result.added} added,`,
        `~${result.updated} updated,`,
        `-${result.expired} expired,`,
        `=${result.unchanged} unchanged`
      )
    }

    return result
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown sync error'
    cacheStore.setSyncError(errorMsg)
    console.warn('[SyncEngine] Sync failed:', errorMsg)
    
    return {
      added: 0, updated: 0, expired: 0, unchanged: 0,
      errors: [errorMsg],
      syncedAt: Date.now(),
    }
  } finally {
    this.isRunning = false
  }
}
```

### 3. Smart Sync Scheduling

Don't sync blindly on interval — be smart about when to sync:

```typescript
start(): void {
  if (this.intervalId) return // Already running

  // Run initial sync after a short delay (let the app settle)
  setTimeout(() => this.syncOnce(), 2000)

  // Schedule periodic syncs
  this.intervalId = setInterval(() => {
    // Skip sync if page is hidden
    if (document.hidden) return

    // Skip sync if user hasn't interacted recently (idle detection)
    // Skip sync if network is offline
    if (!navigator.onLine) return

    this.syncOnce()
  }, this.syncIntervalMs)
}
```

### 4. Network-Aware Syncing

Respect network conditions:

```typescript
private setupNetworkListeners(): void {
  // Sync immediately when coming back online
  window.addEventListener('online', () => {
    console.info('[SyncEngine] Network restored, triggering sync')
    this.syncOnce()
  })

  // Pause sync when going offline
  window.addEventListener('offline', () => {
    console.info('[SyncEngine] Network lost, pausing sync')
  })
}
```

### 5. `useBackgroundSync` Hook

React hook that manages the sync engine lifecycle:

```typescript
// src/hooks/useBackgroundSync.ts
'use client'

import { useEffect, useRef } from 'react'
import { useAppKitAccount } from '@reown/appkit/react'
import { useCacheStore } from '@/stores/cacheStore'
import { CacheSyncEngine } from '@/lib/cache/syncEngine'

export function useBackgroundSync(): void {
  const { address, isConnected } = useAppKitAccount()
  const { autoSyncEnabled, isInitialized } = useCacheStore()
  const engineRef = useRef<CacheSyncEngine | null>(null)

  useEffect(() => {
    // Only start sync when cache is initialized and auto-sync is enabled
    if (!isConnected || !address || !isInitialized || !autoSyncEnabled) {
      engineRef.current?.stop()
      engineRef.current = null
      return
    }

    // Create and start engine
    const engine = new CacheSyncEngine(address.toLowerCase())
    engine.start()
    engineRef.current = engine

    return () => {
      engine.stop()
      engineRef.current = null
    }
  }, [address, isConnected, isInitialized, autoSyncEnabled])
}
```

### 6. Singleton Engine Management

Prevent multiple engines for the same wallet:

```typescript
const activeEngines = new Map<string, CacheSyncEngine>()

export function getSyncEngine(walletAddress: string): CacheSyncEngine {
  const key = walletAddress.toLowerCase()
  if (!activeEngines.has(key)) {
    activeEngines.set(key, new CacheSyncEngine(key))
  }
  return activeEngines.get(key)!
}

export function stopAllSyncEngines(): void {
  for (const engine of activeEngines.values()) {
    engine.stop()
  }
  activeEngines.clear()
}
```

## Sync Frequency Strategy

| Condition | Sync Interval |
|-----------|--------------|
| Page visible + active user | 5 minutes (default) |
| Page visible + idle user | 15 minutes |
| Page hidden (background tab) | No sync |
| Just came back online | Immediate |
| Just became visible | Immediate (if stale > 5 min) |
| User manually triggers | Immediate |

## Acceptance Criteria

- [ ] Sync engine runs on configurable interval
- [ ] Concurrent syncs are prevented (mutex)
- [ ] Sync pauses when page is hidden
- [ ] Sync pauses when offline
- [ ] Sync triggers immediately when coming back online
- [ ] Sync results update the Zustand store
- [ ] `useBackgroundSync` hook manages engine lifecycle
- [ ] Engine stops when wallet disconnects
- [ ] Engine stops when auto-sync is disabled
- [ ] Singleton management prevents duplicate engines
- [ ] Console logs provide sync summaries

## Testing Notes

- Test sync interval fires correctly (use fake timers)
- Test concurrent sync prevention
- Test network online/offline handling
- Test page visibility handling
- Test engine start/stop lifecycle
- Test that sync errors don't crash the engine (it should retry on next interval)