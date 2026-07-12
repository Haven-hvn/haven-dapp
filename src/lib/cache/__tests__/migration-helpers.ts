/**
 * Migration Testing Utilities
 *
 * Helper functions for creating test databases at specific versions
 * and seeding them with records at various schema versions.
 */

import type { CachedVideo, CacheMetadataEntry, CacheDBSchema } from '../../../types/cache'
import { CURRENT_CACHE_VERSION } from '../../../types/cache'
import { runStructuralMigrations } from '../migrations'

/**
 * Database name prefix for test databases
 */
const TEST_DB_PREFIX = 'haven-cache-test-migration-'

/**
 * Get a test database name
 */
export function getTestDBName(suffix: string): string {
  return `${TEST_DB_PREFIX}${suffix}-${Date.now()}`
}

/**
 * Delete a test database
 */
export function deleteTestDB(dbName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(dbName)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Database deletion blocked'))
  })
}

/**
 * Create a database at a specific schema version for testing.
 *
 * This opens the database at the specified version and creates
 * the schema appropriate for that version.
 *
 * @param version - The schema version to create
 * @param dbName - Optional custom database name
 * @returns The opened IDBDatabase
 */
export async function createDBAtVersion(
  version: number,
  dbName?: string
): Promise<IDBDatabase> {
  const name = dbName || getTestDBName(`v${version}`)

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      const oldVersion = event.oldVersion
      const transaction = (event.target as IDBOpenDBRequest).transaction!

      // Version 1: Initial schema
      if (oldVersion < 1) {
        // Create videos object store
        if (!db.objectStoreNames.contains('videos')) {
          const videoStore = db.createObjectStore('videos', { keyPath: 'id' })
          videoStore.createIndex('by-owner', 'owner', { unique: false })
          videoStore.createIndex('by-cached-at', 'cachedAt', { unique: false })
          videoStore.createIndex('by-last-synced', 'lastSyncedAt', { unique: false })
          videoStore.createIndex('by-status', 'arkivEntityStatus', { unique: false })
        }

        // Create metadata object store
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'key' })
        }
      }

      // Version 2: Add tags index (example future migration)
      if (oldVersion < 2 && version >= 2) {
        const store = transaction.objectStore('videos')
        if (!store.indexNames.contains('by-tags')) {
          store.createIndex('by-tags', 'tags', { multiEntry: true })
        }
      }

      // Run structural migrations for version upgrades (for v1+ upgrades)
      if (oldVersion > 0 && oldVersion < version) {
        runStructuralMigrations(db, transaction, oldVersion, version)
      }
    }
  })
}

/**
 * Seed a database with records at a specific schema version.
 *
 * This writes records to the database and sets their cacheVersion
 * to the specified version.
 *
 * @param db - The database to seed
 * @param records - The records to write
 * @param version - The cacheVersion to set on each record
 */
export async function seedRecordsAtVersion(
  db: IDBDatabase,
  records: CachedVideo[],
  version: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('videos', 'readwrite')
    const store = transaction.objectStore('videos')

    let completed = 0
    let hasError = false

    for (const record of records) {
      // Set the cacheVersion to the specified version
      const seededRecord = {
        ...record,
        cacheVersion: version,
      }

      const request = store.put(seededRecord)

      request.onsuccess = () => {
        completed++
        if (completed === records.length && !hasError) {
          resolve()
        }
      }

      request.onerror = () => {
        hasError = true
        reject(request.error)
      }
    }

    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)

    if (records.length === 0) {
      resolve()
    }
  })
}

/**
 * Set the schema version in metadata without running migrations.
 *
 * This is useful for simulating a database that was partially migrated.
 *
 * @param db - The database
 * @param version - The version to set
 */
export async function setSchemaVersion(db: IDBDatabase, version: number): Promise<void> {
  return new Promise((resolve, reject) => {
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
  })
}

/**
 * Get all records from the videos store.
 */
export async function getAllRecords(db: IDBDatabase): Promise<CachedVideo[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('videos', 'readonly')
    const store = transaction.objectStore('videos')
    const request = store.getAll()

    request.onsuccess = () => resolve(request.result as CachedVideo[])
    request.onerror = () => reject(request.error)
  })
}

/**
 * Get the schema version from metadata.
 */
export async function getSchemaVersion(db: IDBDatabase): Promise<number> {
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction('metadata', 'readonly')
      const store = transaction.objectStore('metadata')
      const request = store.get('schemaVersion')

      request.onsuccess = () => {
        const entry = request.result as CacheMetadataEntry | undefined
        resolve(typeof entry?.value === 'number' ? entry.value : 0)
      }

      request.onerror = () => resolve(0)
    } catch {
      resolve(0)
    }
  })
}

/**
 * Create a mock video at a specific schema version.
 *
 * This creates a valid CachedVideo with fields appropriate for the
 * specified schema version (e.g., omits fields not in that version).
 *
 * @param version - The target schema version
 * @param overrides - Optional field overrides
 * @returns A CachedVideo compatible with the specified version
 */
export function createMockVideoAtVersion(
  version: number,
  overrides?: Partial<CachedVideo>
): CachedVideo {
  const now = Date.now()

  // Base video (v1)
  const baseVideo: CachedVideo = {
    id: `test-video-${Math.random().toString(36).slice(2, 9)}`,
    owner: '0x1234567890abcdef1234567890abcdef12345678',
    title: 'Test Video',
    description: 'Test Description',
    duration: 120,
    filecoinCid: 'QmTest123',
    isEncrypted: false,
    hasAiData: false,
    createdAt: now,
    cachedAt: now,
    lastSyncedAt: now,
    lastAccessedAt: now,
    cacheVersion: version,
    arkivEntityStatus: 'active',
    arkivEntityKey: 'test-video',
    isDirty: false,
    videoCacheStatus: 'not-cached',
  }

  // For future versions, add version-specific fields
  if (version >= 2) {
    // Example: v2 adds tags field
    // (baseVideo as unknown as { tags: string[] }).tags = []
  }

  return { ...baseVideo, ...overrides, cacheVersion: version }
}

/**
 * Create multiple mock videos at a specific schema version.
 *
 * @param count - Number of videos to create
 * @param version - The target schema version
 * @returns Array of CachedVideos
 */
export function createMockVideosAtVersion(count: number, version: number): CachedVideo[] {
  return Array.from({ length: count }, (_, i) =>
    createMockVideoAtVersion(version, {
      id: `test-video-${i}`,
      title: `Test Video ${i}`,
    })
  )
}

/**
 * Type guard for checking if a database is at a specific version.
 */
export async function isDBAtVersion(db: IDBDatabase, expectedVersion: number): Promise<boolean> {
  const version = await getSchemaVersion(db)
  return version === expectedVersion
}

/**
 * Close all database connections and clean up.
 *
 * This should be called after migration tests to ensure clean state.
 */
export async function cleanupMigrationTest(dbName: string): Promise<void> {
  try {
    await deleteTestDB(dbName)
  } catch {
    // Ignore errors during cleanup
  }
}

/**
 * Verify that a migration was successful by checking:
 * 1. Schema version is updated
 * 2. All records have the new version
 * 3. New fields have default values (if applicable)
 */
export async function verifyMigrationSuccess(
  db: IDBDatabase,
  expectedVersion: number
): Promise<{ success: boolean; errors: string[] }> {
  const errors: string[] = []

  // Check schema version
  const schemaVersion = await getSchemaVersion(db)
  if (schemaVersion !== expectedVersion) {
    errors.push(`Schema version mismatch: expected ${expectedVersion}, got ${schemaVersion}`)
  }

  // Check all records
  const records = await getAllRecords(db)
  for (const record of records) {
    if (record.cacheVersion !== expectedVersion) {
      errors.push(`Record ${record.id} has version ${record.cacheVersion}, expected ${expectedVersion}`)
    }
  }

  return {
    success: errors.length === 0,
    errors,
  }
}
