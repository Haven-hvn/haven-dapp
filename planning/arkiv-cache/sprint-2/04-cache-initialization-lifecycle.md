# Task 2.4 — Cache Initialization & Lifecycle Management

**Sprint:** 2 — Core Integration  
**Estimate:** 3–4 hours  
**Files:** `src/hooks/useCacheInit.ts` (new), `src/app/layout.tsx` (modify)

## Objective

Implement cache initialization on app startup and lifecycle management tied to wallet connect/disconnect events. Ensure the cache is ready before the first data fetch and properly cleaned up when the user switches wallets.

## Background

The cache layer needs to be initialized early in the app lifecycle:
1. Check IndexedDB availability
2. Open the database for the connected wallet
3. Set the cache store to "initialized"
4. Handle wallet changes (close old DB, open new one)
5. Handle wallet disconnect (close DB, optionally reset store)

This must happen before React Query fires its first `fetchAllVideos` call, otherwise the cache won't be populated on the initial fetch.

## Prerequisites

- Task 2.2 (updated React Query hooks)
- Task 2.3 (cache state store)

## Requirements

### 1. `useCacheInit` Hook

```typescript
// src/hooks/useCacheInit.ts
'use client'

import { useEffect, useRef } from 'react'
import { useAppKitAccount } from '@reown/appkit/react'
import { useCacheStore } from '@/stores/cacheStore'
import { getCacheDB, closeCacheDB, closeAllCacheDBs } from '@/lib/cache'
import { getVideoCacheService } from '@/services/cacheService'

/**
 * Initializes the cache layer when a wallet connects.
 * Should be mounted once at the app root level.
 * 
 * Handles:
 * - Opening IndexedDB on wallet connect
 * - Closing IndexedDB on wallet disconnect
 * - Switching databases when wallet changes
 * - Detecting IndexedDB availability
 */
export function useCacheInit(): void {
  const { address, isConnected } = useAppKitAccount()
  const previousAddress = useRef<string | null>(null)
  const { 
    setInitialized, 
    setAvailable, 
    reset: resetCacheStore 
  } = useCacheStore()

  useEffect(() => {
    // Skip on server
    if (typeof window === 'undefined') return

    // Check IndexedDB availability once
    if (!window.indexedDB) {
      setAvailable(false)
      console.warn('[CacheInit] IndexedDB not available')
      return
    }

    async function initCache(walletAddress: string) {
      try {
        // Close previous wallet's DB if switching
        if (previousAddress.current && previousAddress.current !== walletAddress) {
          closeCacheDB(previousAddress.current)
          resetCacheStore()
        }

        // Open DB for new wallet (this also creates schema if needed)
        await getCacheDB(walletAddress)
        
        // Load initial cache stats
        const cacheService = getVideoCacheService(walletAddress)
        const stats = await cacheService.getStats()
        useCacheStore.getState().setStats(stats)

        // Mark as initialized
        setInitialized(true)
        previousAddress.current = walletAddress

        console.info(
          `[CacheInit] Cache ready for ${walletAddress.slice(0, 8)}...`,
          `(${stats.totalVideos} cached videos)`
        )
      } catch (error) {
        console.warn('[CacheInit] Failed to initialize cache:', error)
        setAvailable(false)
        setInitialized(false)
      }
    }

    function teardownCache() {
      if (previousAddress.current) {
        closeCacheDB(previousAddress.current)
        previousAddress.current = null
      }
      resetCacheStore()
    }

    if (isConnected && address) {
      initCache(address.toLowerCase())
    } else {
      teardownCache()
    }

    // Cleanup on unmount
    return () => {
      closeAllCacheDBs()
    }
  }, [address, isConnected, setInitialized, setAvailable, resetCacheStore])
}
```

### 2. `CacheInitProvider` Component

Wrap the hook in a component for cleaner integration into the component tree:

```typescript
// src/components/providers/CacheInitProvider.tsx
'use client'

import { useCacheInit } from '@/hooks/useCacheInit'

/**
 * Provider component that initializes the cache layer.
 * Mount once at the app root, inside the wallet provider.
 */
export function CacheInitProvider({ children }: { children: React.ReactNode }) {
  useCacheInit()
  return <>{children}</>
}
```

### 3. Integrate into App Layout

Add the provider to the app's root layout, inside the existing provider hierarchy:

```typescript
// src/app/layout.tsx (modification)

import { CacheInitProvider } from '@/components/providers/CacheInitProvider'

// Inside the provider tree, after wallet/auth providers:
<WalletProvider>
  <AuthProvider>
    <CacheInitProvider>
      <QueryProvider>
        {children}
      </QueryProvider>
    </CacheInitProvider>
  </AuthProvider>
</WalletProvider>
```

**Important:** `CacheInitProvider` must be:
- **After** wallet provider (needs `useAppKitAccount`)
- **Before** query provider (cache must be ready before React Query fetches)

### 4. Wallet Change Detection

Handle the case where a user switches wallets without disconnecting:

```typescript
// In useCacheInit, the useEffect dependency on `address` handles this:
// When address changes: close old DB → reset store → open new DB

// Edge case: rapid wallet switching
// Use a ref to track the "current" initialization and abort stale ones
const initializingRef = useRef<string | null>(null)

async function initCache(walletAddress: string) {
  initializingRef.current = walletAddress
  
  // ... initialization logic ...
  
  // Check if we're still the current initialization
  if (initializingRef.current !== walletAddress) {
    // Another wallet connected while we were initializing
    closeCacheDB(walletAddress)
    return
  }
  
  setInitialized(true)
}
```

### 5. Page Visibility Handling

Pause/resume cache operations based on page visibility:

```typescript
useEffect(() => {
  function handleVisibilityChange() {
    if (document.hidden) {
      // Page is hidden — no need to sync
      // Background sync will be handled in Sprint 3
    } else {
      // Page is visible again — trigger a sync if stale
      if (address && useCacheStore.getState().autoSyncEnabled) {
        const lastSync = useCacheStore.getState().lastSyncedAt
        const staleThreshold = 5 * 60 * 1000 // 5 minutes
        if (!lastSync || Date.now() - lastSync > staleThreshold) {
          // Trigger re-fetch (handled by React Query's refetchOnWindowFocus)
        }
      }
    }
  }

  document.addEventListener('visibilitychange', handleVisibilityChange)
  return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
}, [address])
```

### 6. Error Recovery

If cache initialization fails (e.g., IndexedDB blocked in private browsing):

```typescript
// The app should continue working without cache
// Set isAvailable = false in the store
// All cache service methods are already fail-safe (return empty/null)
// UI can optionally show a "cache unavailable" indicator
```

## Lifecycle Diagram

```
App Mount
  │
  ├─ No wallet connected
  │   └─ Cache not initialized (waiting)
  │
  ├─ Wallet connects
  │   ├─ Check IndexedDB availability
  │   ├─ Open DB for wallet address
  │   ├─ Load cache stats
  │   ├─ Set initialized = true
  │   └─ React Query can now use cache
  │
  ├─ Wallet switches (address changes)
  │   ├─ Close old wallet's DB
  │   ├─ Reset cache store
  │   ├─ Open new wallet's DB
  │   └─ Set initialized = true
  │
  ├─ Wallet disconnects
  │   ├─ Close DB
  │   ├─ Reset cache store
  │   └─ Set initialized = false
  │
  └─ App Unmount
      └─ Close all DB connections
```

## Acceptance Criteria

- [ ] Cache initializes automatically when wallet connects
- [ ] Cache DB closes when wallet disconnects
- [ ] Wallet switching properly closes old DB and opens new one
- [ ] Rapid wallet switching doesn't cause race conditions
- [ ] IndexedDB unavailability is detected and handled gracefully
- [ ] Cache stats are loaded on initialization
- [ ] `CacheInitProvider` is integrated into the app layout
- [ ] Provider ordering is correct (after wallet, before query)
- [ ] Page visibility changes are handled
- [ ] App works normally when cache is unavailable
- [ ] Console logs provide useful debugging info

## Testing Notes

- Test wallet connect → cache initialized
- Test wallet disconnect → cache cleaned up
- Test wallet switch → old DB closed, new DB opened
- Test IndexedDB unavailable → app still works, `isAvailable` is false
- Test rapid connect/disconnect → no race conditions or errors
- Test page refresh with connected wallet → cache re-initializes