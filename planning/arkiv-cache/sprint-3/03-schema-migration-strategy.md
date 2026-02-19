# Task 3.3 — Schema Migration Strategy

**Sprint:** 3 — Sync & Resilience  
**Estimate:** 3–4 hours  
**Files:** `src/lib/cache/migrations.ts` (new), `src/lib/cache/db.ts` (modify)

## Objective

Implement a robust schema migration system for the IndexedDB cache so that future changes to the `CachedVideo` structure don't require users to lose their cached data. The migration system should handle version upgrades transparently.

## Background

IndexedDB has a built-in versioning mechanism — when you open a database with a higher version number than what exists, the `upgrade` callback fires. However, IndexedDB's upgrade mechanism only handles structural changes (creating/deleting object stores and indexes). Data migrations (transforming existing records) must be handled manually.

As the cache schema evolves (new fields, renamed fields, changed types), we need a migration pipeline that:
1. Detects the current schema version
2. Runs all necessary migrations in sequence
3. Updates each record to the latest schema
4. Handles failures gracefully (don't corrupt data)

## Prerequisites

- Task 1.2 (IndexedDB service)

## Requirements

### 1. Migration Registry

```typescript
// src/lib/cache/migrations.ts

export interface Migration {
  /** Version this migration upgrades FROM */
  fromVersion: number
  /** Version this migration upgrades TO */
  toVersion: number
  /** Human-readable description */
  description: string
  /** 
   * Structural migration — runs during IndexedDB upgrade event.
   * Can create/delete object stores and indexes.
   */
  structural?: (db: IDBDatabase, transaction: IDBTransaction) => void
  /** 
   * Data migration — runs after DB is opened.
   * Transforms existing records to new schema.
   */
  data?: (db: IDBPDatabase<CacheDBSchema>) => Promise<void>
}

/** Current schema version */
export const CURRENT_CACHE_VERSION = 1

/** Registry of all migrations */
export const migrations: Migration[] = [
  // Version 1 is the initial schema — no migration needed
  // Future migrations will be added here:
  //
  // {
  //   fromVersion: 1,
  //   toVersion: 2,
  //   description: 'Add thumbnailCid field to cached videos',
  //   data: async (db) => {
  //     const tx = db.transaction('videos', 'readwrite')
  //     let cursor = await tx.store.openCursor()
  //     while (cursor) {
  //       const video = cursor.value
  //       if (video.cacheVersion === 1) {
  //         video.thumbnailCid = video.thumbnailUrl || null
  //         video.cacheVersion = 2
  //         await cursor.update(video)
  //       }
  //       cursor = await cursor.continue()
  //     }
  //     await tx.done
  //   }
  // },
]
```

### 2. Migration Runner

```typescript
export async function runMigrations(
  db: IDBPDatabase<CacheDBSchema>,
  fromVersion: number,
  toVersion: number
): Promise<void> {
  // Get applicable migrations, sorted by version
  const applicable = migrations
    .filter(m => m.fromVersion >= fromVersion && m.toVersion <= toVersion)
    .sort((a, b) => a.fromVersion - b.fromVersion)

  if (applicable.length === 0) return

  console.info(
    `[Migrations] Running ${applicable.length} migration(s):`,
    `v${fromVersion} → v${toVersion}`
  )

  for (const migration of applicable) {
    try {
      console.info(`[Migrations] Running: ${migration.description}`)
      
      if (migration.data) {
        await migration.data(db)
      }

      console.info(`[Migrations] Completed: v${migration.fromVersion} → v${migration.toVersion}`)
    } catch (error) {
      console.error(`[Migrations] Failed: ${migration.description}`, error)
      // Don't throw — partial migration is better than no data
      // Mark the migration as failed in metadata
      break
    }
  }

  // Update schema version in metadata
  const tx = db.transaction('metadata', 'readwrite')
  await tx.store.put({
    key: 'schemaVersion',
    value: toVersion,
    updatedAt: Date.now(),
  })
  await tx.done
}
```

### 3. Integrate with Database Open

Modify `openCacheDB` to run migrations:

```typescript
// In src/lib/cache/db.ts

async function openCacheDB(walletAddress: string): Promise<IDBPDatabase<CacheDBSchema>> {
  const dbName = `haven-cache-${walletAddress}`
  
  const db = await openDB<CacheDBSchema>(dbName, CURRENT_CACHE_VERSION, {
    upgrade(db, oldVersion, newVersion, transaction) {
      // Structural migrations (create stores, indexes)
      if (oldVersion < 1) {
        // Initial schema
        const videoStore = db.createObjectStore('videos', { keyPath: 'id' })
        videoStore.createIndex('by-owner', 'owner')
        videoStore.createIndex('by-cached-at', 'cachedAt')
        videoStore.createIndex('by-last-synced', 'lastSyncedAt')
        videoStore.createIndex('by-status', 'arkivEntityStatus')

        db.createObjectStore('metadata', { keyPath: 'key' })
      }

      // Run structural migrations for each version
      const applicableMigrations = migrations.filter(
        m => m.fromVersion >= oldVersion && m.toVersion <= (newVersion || CURRENT_CACHE_VERSION)
      )
      for (const migration of applicableMigrations) {
        if (migration.structural) {
          migration.structural(db as unknown as IDBDatabase, transaction as unknown as IDBTransaction)
        }
      }
    },
  })

  // Run data migrations after DB is open
  const storedVersion = await getStoredSchemaVersion(db)
  if (storedVersion < CURRENT_CACHE_VERSION) {
    await runMigrations(db, storedVersion, CURRENT_CACHE_VERSION)
  }

  return db
}

async function getStoredSchemaVersion(db: IDBPDatabase<CacheDBSchema>): Promise<number> {
  try {
    const entry = await db.get('metadata', 'schemaVersion')
    return typeof entry?.value === 'number' ? entry.value : 0
  } catch {
    return 0
  }
}
```

### 4. Per-Record Version Tracking

Each `CachedVideo` has a `cacheVersion` field. During data migrations, update this field:

```typescript
// Example: migrating a record from v1 to v2
function migrateVideoV1toV2(video: CachedVideo): CachedVideo {
  return {
    ...video,
    // Add new field with default value
    newField: video.newField ?? 'default',
    // Update version
    cacheVersion: 2,
  }
}
```

This allows lazy migration — records that haven't been migrated yet can be detected and migrated on read:

```typescript
// In transforms.ts or cacheService.ts
function ensureLatestVersion(video: CachedVideo): CachedVideo {
  if (video.cacheVersion === CURRENT_CACHE_VERSION) {
    return video
  }
  
  let migrated = video
  if (migrated.cacheVersion < 2) {
    migrated = migrateVideoV1toV2(migrated)
  }
  // Add more version checks as needed
  
  return migrated
}
```

### 5. Migration Testing Utilities

```typescript
// src/lib/cache/__tests__/migration-helpers.ts

/** Create a database at a specific version for testing */
export async function createDBAtVersion(
  walletAddress: string, 
  version: number
): Promise<IDBPDatabase<CacheDBSchema>> {
  // Open DB at the specified version with only that version's schema
}

/** Seed a database with records at a specific schema version */
export async function seedRecordsAtVersion(
  db: IDBPDatabase<CacheDBSchema>,
  records: CachedVideo[],
  version: number
): Promise<void> {
  // Write records with cacheVersion set to the specified version
}
```

### 6. Rollback Strategy

If a migration fails partway through:

```typescript
// Option 1: Continue with partially migrated data
// Records have individual cacheVersion, so unmigrated records
// will be lazily migrated on next read

// Option 2: Mark migration as failed in metadata
await db.put('metadata', {
  key: 'migrationFailed',
  value: `v${fromVersion}→v${toVersion}`,
  updatedAt: Date.now(),
})

// Option 3: On next app load, detect failed migration and retry
const failedMigration = await db.get('metadata', 'migrationFailed')
if (failedMigration) {
  console.warn('[Migrations] Retrying failed migration:', failedMigration.value)
  // Retry...
}
```

## Example Future Migration

When we add a `tags` field to `CachedVideo` in v2:

```typescript
{
  fromVersion: 1,
  toVersion: 2,
  description: 'Add tags array to cached videos',
  structural: (db) => {
    // Add a new index for tags
    const store = db.transaction.objectStore('videos')
    store.createIndex('by-tags', 'tags', { multiEntry: true })
  },
  data: async (db) => {
    const tx = db.transaction('videos', 'readwrite')
    let cursor = await tx.store.openCursor()
    while (cursor) {
      const video = cursor.value
      if (video.cacheVersion < 2) {
        video.tags = []
        video.cacheVersion = 2
        await cursor.update(video)
      }
      cursor = await cursor.continue()
    }
    await tx.done
  }
}
```

## Acceptance Criteria

- [ ] Migration registry supports structural and data migrations
- [ ] Migrations run in order during database open
- [ ] Per-record `cacheVersion` enables lazy migration
- [ ] Failed migrations don't corrupt existing data
- [ ] Failed migrations are detected and retried on next load
- [ ] `CURRENT_CACHE_VERSION` constant is the single source of truth
- [ ] Migration runner logs progress for debugging
- [ ] Structural migrations run in the `upgrade` callback
- [ ] Data migrations run after DB is opened
- [ ] Testing utilities allow creating DBs at specific versions

## Testing Notes

- Test opening a v1 DB with v2 code → migration runs
- Test opening a v2 DB with v2 code → no migration runs
- Test migration with 1000 records → completes in reasonable time
- Test migration failure midway → remaining records still readable
- Test lazy migration on read for unmigrated records
- Test that new installs skip all migrations (start at latest version)