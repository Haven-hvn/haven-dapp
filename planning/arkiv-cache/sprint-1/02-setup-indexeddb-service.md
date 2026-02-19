# Task 1.2 — Set Up IndexedDB Service Layer

**Sprint:** 1 — Foundation  
**Estimate:** 4–5 hours  
**Files:** `src/lib/cache/db.ts`, `src/lib/cache/index.ts`

## Objective

Create the low-level IndexedDB database service using the `idb` library. This module handles database creation, schema upgrades, and provides typed CRUD operations for cached video records.

## Background

IndexedDB is the only browser storage API that supports structured data, indexes, and large storage quotas (typically 50MB–unlimited depending on browser). The `idb` library wraps the callback-based IndexedDB API with Promises and provides TypeScript generics for type-safe access.

## Prerequisites

- Task 1.1 (cache types) must be completed first
- Install `idb` package: `npm install idb`

## Requirements

### 1. Database Initialization

```typescript
// src/lib/cache/db.ts

import { openDB, type IDBPDatabase } from 'idb'
import type { CacheDBSchema, CacheConfig } from '@/types/cache'

const DEFAULT_CONFIG: CacheConfig = {
  dbName: 'haven-cache',
  dbVersion: 1,
  maxEntries: 5000,
  maxAgeMs: 30 * 24 * 60 * 60 * 1000, // 30 days
  syncIntervalMs: 5 * 60 * 1000,       // 5 minutes
}
```

### 2. Database Open & Schema Migration

Implement `openCacheDB(walletAddress: string)` that:

- Creates a database namespaced by wallet address: `haven-cache-{address}`
- Handles schema upgrades via `upgrade` callback
- Creates object stores:
  - `videos` — primary key: `id` (entity key), indexes on `owner`, `cachedAt`, `lastSyncedAt`, `arkivEntityStatus`
  - `metadata` — primary key: `key`
- Returns a typed `IDBPDatabase<CacheDBSchema>`

```typescript
async function openCacheDB(walletAddress: string): Promise<IDBPDatabase<CacheDBSchema>>
```

### 3. Connection Pooling

Implement a singleton pattern per wallet address to avoid opening multiple connections:

```typescript
const dbInstances = new Map<string, IDBPDatabase<CacheDBSchema>>()

export async function getCacheDB(walletAddress: string): Promise<IDBPDatabase<CacheDBSchema>> {
  const key = walletAddress.toLowerCase()
  if (dbInstances.has(key)) {
    return dbInstances.get(key)!
  }
  const db = await openCacheDB(key)
  dbInstances.set(key, db)
  return db
}

export function closeCacheDB(walletAddress: string): void {
  // Close and remove from pool
}

export function closeAllCacheDBs(): void {
  // Close all open connections
}
```

### 4. CRUD Operations

Implement typed operations in `src/lib/cache/db.ts`:

```typescript
// Single record operations
export async function putCachedVideo(walletAddress: string, video: CachedVideo): Promise<void>
export async function getCachedVideo(walletAddress: string, videoId: string): Promise<CachedVideo | undefined>
export async function deleteCachedVideo(walletAddress: string, videoId: string): Promise<void>

// Bulk operations
export async function putCachedVideos(walletAddress: string, videos: CachedVideo[]): Promise<void>
export async function getAllCachedVideos(walletAddress: string): Promise<CachedVideo[]>
export async function getCachedVideosByStatus(
  walletAddress: string, 
  status: 'active' | 'expired' | 'unknown'
): Promise<CachedVideo[]>

// Metadata operations
export async function getCacheMetadata(walletAddress: string, key: string): Promise<CacheMetadataEntry | undefined>
export async function setCacheMetadata(walletAddress: string, key: string, value: string | number | boolean): Promise<void>

// Maintenance
export async function clearCache(walletAddress: string): Promise<void>
export async function deleteDatabase(walletAddress: string): Promise<void>
export async function getCacheCount(walletAddress: string): Promise<number>
```

### 5. Bulk Write with Transactions

Use IndexedDB transactions for bulk writes to ensure atomicity:

```typescript
export async function putCachedVideos(walletAddress: string, videos: CachedVideo[]): Promise<void> {
  const db = await getCacheDB(walletAddress)
  const tx = db.transaction('videos', 'readwrite')
  await Promise.all([
    ...videos.map(video => tx.store.put(video)),
    tx.done,
  ])
}
```

### 6. Barrel Export

```typescript
// src/lib/cache/index.ts
export * from './db'
export type { CacheDBSchema } from '@/types/cache'
```

## Error Handling

- Wrap all IndexedDB operations in try/catch
- Create a `CacheError` class extending `Error` with codes: `DB_OPEN_FAILED`, `READ_ERROR`, `WRITE_ERROR`, `TRANSACTION_ERROR`, `QUOTA_EXCEEDED`
- Handle `QuotaExceededError` specifically — when storage is full, evict oldest entries by `lastAccessedAt`
- Log errors but never throw to the UI — cache failures should be silent and non-blocking

## Acceptance Criteria

- [ ] `idb` package installed and added to `package.json`
- [ ] `openCacheDB` creates database with correct schema and indexes
- [ ] Connection pooling prevents duplicate database connections
- [ ] All CRUD operations are typed and working
- [ ] Bulk writes use transactions for atomicity
- [ ] `QuotaExceededError` triggers LRU eviction
- [ ] All operations handle errors gracefully (no unhandled rejections)
- [ ] Database is namespaced per wallet address
- [ ] `closeCacheDB` and `closeAllCacheDBs` properly clean up connections
- [ ] Barrel export from `src/lib/cache/index.ts`

## Testing Notes

- Use `fake-indexeddb` package for unit testing IndexedDB operations
- Test schema migration by opening DB at version 1, closing, then opening at version 2
- Test concurrent access patterns (multiple reads/writes)
- Test quota exceeded handling with mock