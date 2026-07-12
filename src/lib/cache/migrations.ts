/**
 * Schema Migration System
 *
 * Handles versioned migrations for the IndexedDB cache.
 * Supports both structural migrations (schema changes) and data migrations
 * (record transformations).
 *
 * Migration Flow:
 * 1. Database opens with CURRENT_CACHE_VERSION
 * 2. IndexedDB upgrade event fires if version increased
 * 3. Structural migrations run during upgrade (create indexes, stores)
 * 4. Database opens successfully
 * 5. Data migrations run after open (transform records)
 * 6. Schema version stored in metadata
 */

import type { CachedVideo, CacheDBSchema, CacheMetadataEntry } from '../../types/cache'
import { CURRENT_CACHE_VERSION } from '../../types/cache'

/**
 * Migration definition
 */
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
  data?: (db: IDBDatabase) => Promise<void>
}

/**
 * Re-export current cache version for convenience
 */
export { CURRENT_CACHE_VERSION }

/**
 * Registry of all migrations
 *
 * Add new migrations to this array. They will be sorted and executed
 * in order based on fromVersion.
 */
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
  //     const store = tx.objectStore('videos')
  //     const request = store.openCursor()
  //     
  //     await new Promise<void>((resolve, reject) => {
  //       request.onsuccess = () => {
  //         const cursor = request.result
  //         if (cursor) {
  //           const video = cursor.value as CachedVideo
  //           if (video.cacheVersion === 1) {
  //             video.thumbnailCid = null
  //             video.cacheVersion = 2
  //             cursor.update(video)
  //           }
  //           cursor.continue()
  //         } else {
  //           resolve()
  //         }
  //       }
  //       request.onerror = () => reject(request.error)
  //       tx.oncomplete = () => resolve()
  //     })
  //   }
  // },
]

/**
 * Get the stored schema version from metadata
 */
export async function getStoredSchemaVersion(db: IDBDatabase): Promise<number> {
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction('metadata', 'readonly')
      const store = transaction.objectStore('metadata')
      const request = store.get('schemaVersion')

      request.onsuccess = () => {
        const entry = request.result as CacheMetadataEntry | undefined
        const version = typeof entry?.value === 'number' ? entry.value : 0
        resolve(version)
      }

      request.onerror = () => {
        resolve(0)
      }
    } catch {
      resolve(0)
    }
  })
}

/**
 * Set the stored schema version in metadata
 */
async function setStoredSchemaVersion(db: IDBDatabase, version: number): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction('metadata', 'readwrite')
      const store = transaction.objectStore('metadata')
      const entry: CacheMetadataEntry = {
        key: 'schemaVersion',
        value: version,
        updatedAt: Date.now(),
      }
      const request = store.put(entry)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
      transaction.onerror = () => reject(transaction.error)
    } catch (error) {
      reject(error)
    }
  })
}

/**
 * Mark a migration as failed in metadata for retry on next load
 */
async function markMigrationFailed(
  db: IDBDatabase,
  fromVersion: number,
  toVersion: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction('metadata', 'readwrite')
      const store = transaction.objectStore('metadata')
      const entry: CacheMetadataEntry = {
        key: 'migrationFailed',
        value: `v${fromVersion}→v${toVersion}`,
        updatedAt: Date.now(),
      }
      const request = store.put(entry)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    } catch {
      // Non-critical, don't fail
      resolve()
    }
  })
}

/**
 * Get failed migration info if any
 */
export async function getFailedMigration(db: IDBDatabase): Promise<CacheMetadataEntry | null> {
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction('metadata', 'readonly')
      const store = transaction.objectStore('metadata')
      const request = store.get('migrationFailed')

      request.onsuccess = () => {
        resolve((request.result as CacheMetadataEntry) ?? null)
      }
      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

/**
 * Clear the failed migration marker
 */
async function clearFailedMigration(db: IDBDatabase): Promise<void> {
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction('metadata', 'readwrite')
      const store = transaction.objectStore('metadata')
      const request = store.delete('migrationFailed')

      request.onsuccess = () => resolve()
      request.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}

/**
 * Run applicable data migrations
 *
 * This should be called after the database is opened. It checks the stored
 * schema version and runs any pending data migrations.
 */
export async function runMigrations(
  db: IDBDatabase,
  fromVersion: number,
  toVersion: number
): Promise<void> {
  // Get applicable migrations, sorted by version
  const applicable = migrations
    .filter((m) => m.fromVersion >= fromVersion && m.toVersion <= toVersion)
    .sort((a, b) => a.fromVersion - b.fromVersion)

  // Update version even if no migrations (new install case)
  if (applicable.length === 0) {
    if (fromVersion !== toVersion) {
      await setStoredSchemaVersion(db, toVersion)
    }
    return
  }

  console.info(
    `[Migrations] Running ${applicable.length} migration(s): v${fromVersion} → v${toVersion}`
  )

  let lastSuccessfulVersion = fromVersion

  for (const migration of applicable) {
    try {
      console.info(`[Migrations] Running: ${migration.description}`)

      if (migration.data) {
        await migration.data(db)
      }

      lastSuccessfulVersion = migration.toVersion
      console.info(`[Migrations] Completed: v${migration.fromVersion} → v${migration.toVersion}`)
    } catch (error) {
      console.error(`[Migrations] Failed: ${migration.description}`, error)
      // Don't throw — partial migration is better than no data
      // Mark the migration as failed in metadata for retry
      await markMigrationFailed(db, migration.fromVersion, migration.toVersion)
      break
    }
  }

  // Update schema version to the last successful migration
  if (lastSuccessfulVersion > fromVersion) {
    await setStoredSchemaVersion(db, lastSuccessfulVersion)
  }

  // Clear any previous failure marker if we completed all migrations
  if (lastSuccessfulVersion === toVersion) {
    await clearFailedMigration(db)
  }
}

/**
 * Run structural migrations during the upgrade event
 *
 * This should be called from the onupgradeneeded handler.
 */
export function runStructuralMigrations(
  db: IDBDatabase,
  transaction: IDBTransaction,
  oldVersion: number,
  newVersion: number
): void {
  const applicable = migrations.filter(
    (m) => m.fromVersion >= oldVersion && m.toVersion <= newVersion && m.structural
  )

  for (const migration of applicable) {
    try {
      console.info(`[Migrations] Running structural: ${migration.description}`)
      migration.structural!(db, transaction)
      console.info(`[Migrations] Structural complete: v${migration.fromVersion} → v${migration.toVersion}`)
    } catch (error) {
      console.error(`[Migrations] Structural failed: ${migration.description}`, error)
      // Don't throw — structural failures are more serious but we try to continue
    }
  }
}

/**
 * Example migration: Add tags field (for documentation)
 *
 * This shows how to add a future migration when adding the `tags` field to v2.
 */
export const exampleV1toV2Migration: Migration = {
  fromVersion: 1,
  toVersion: 2,
  description: 'Add tags array to cached videos',
  structural: (db, transaction) => {
    // Add a new index for tags
    const store = transaction.objectStore('videos')
    // Note: createIndex would need to be done during version upgrade
    // This is just an example
    if (!store.indexNames.contains('by-tags')) {
      store.createIndex('by-tags', 'tags', { multiEntry: true })
    }
  },
  data: async (db) => {
    const tx = db.transaction('videos', 'readwrite')
    const store = tx.objectStore('videos')
    const request = store.openCursor()

    await new Promise<void>((resolve, reject) => {
      let migrated = 0

      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) {
          const video = cursor.value as CachedVideo & { tags?: string[] }
          if (video.cacheVersion < 2) {
            // Add new field with default value
            video.tags = []
            video.cacheVersion = 2
            cursor.update(video)
            migrated++
          }
          cursor.continue()
        } else {
          console.info(`[Migrations] Migrated ${migrated} videos to v2`)
          resolve()
        }
      }

      request.onerror = () => reject(request.error)
      tx.oncomplete = () => resolve()
    })
  },
}

/**
 * Ensure a video is at the latest schema version.
 *
 * This enables lazy migration — records that haven't been migrated yet
 * can be detected and migrated on read.
 */
export function ensureLatestVersion(video: CachedVideo): CachedVideo {
  if (video.cacheVersion === CURRENT_CACHE_VERSION) {
    return video
  }

  let migrated = { ...video }

  // Apply migrations in sequence
  // Add version checks as needed for future migrations
  // if (migrated.cacheVersion < 2) {
  //   migrated = migrateVideoV1toV2(migrated)
  // }

  // Update to current version after all migrations
  migrated.cacheVersion = CURRENT_CACHE_VERSION

  return migrated
}

/**
 * Migration function example: v1 to v2
 *
 * This would be called by ensureLatestVersion for lazy migration.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function migrateVideoV1toV2(video: CachedVideo): CachedVideo {
  return {
    ...video,
    // Add new field with default value
    // newField: (video as unknown as Record<string, unknown>).newField ?? 'default',
    // Update version
    cacheVersion: 2,
  }
}
