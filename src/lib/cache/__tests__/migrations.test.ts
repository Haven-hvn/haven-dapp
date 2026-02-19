/**
 * Migration System Unit Tests
 *
 * Tests for the schema migration system including:
 * - Migration registry and runner
 * - Structural migrations during upgrade
 * - Data migrations after open
 * - Lazy migration on read
 * - Failure handling and retry
 */

import 'fake-indexeddb/auto'

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { CachedVideo, CacheMetadataEntry } from '../../../types/cache'
import { CURRENT_CACHE_VERSION } from '../../../types/cache'
import {
  runMigrations,
  runStructuralMigrations,
  getStoredSchemaVersion,
  getFailedMigration,
  migrations,
  ensureLatestVersion as ensureVideoAtLatestVersion,
  type Migration,
} from '../migrations'
import {
  createDBAtVersion,
  seedRecordsAtVersion,
  setSchemaVersion,
  getAllRecords,
  getSchemaVersion,
  createMockVideoAtVersion,
  createMockVideosAtVersion,
  verifyMigrationSuccess,
  getTestDBName,
  deleteTestDB,
} from './migration-helpers'

describe('Migration Registry', () => {
  it('exports CURRENT_CACHE_VERSION', () => {
    expect(CURRENT_CACHE_VERSION).toBe(1)
  })

  it('has empty migrations array initially', () => {
    expect(migrations).toBeDefined()
    expect(Array.isArray(migrations)).toBe(true)
    // v1 is initial schema, no migrations needed
    expect(migrations.length).toBe(0)
  })
})

describe('getStoredSchemaVersion', () => {
  const dbName = getTestDBName('version-test')

  afterEach(async () => {
    await deleteTestDB(dbName)
  })

  it('returns 0 for new database', async () => {
    const db = await createDBAtVersion(1, dbName)
    const version = await getStoredSchemaVersion(db)
    expect(version).toBe(0)
    db.close()
  })

  it('returns stored version after setting', async () => {
    const db = await createDBAtVersion(1, dbName)
    await setSchemaVersion(db, 2)
    const version = await getStoredSchemaVersion(db)
    expect(version).toBe(2)
    db.close()
  })
})

describe('getFailedMigration', () => {
  const dbName = getTestDBName('failed-test')

  afterEach(async () => {
    await deleteTestDB(dbName)
  })

  it('returns null when no failed migration', async () => {
    const db = await createDBAtVersion(1, dbName)
    const failed = await getFailedMigration(db)
    expect(failed).toBeNull()
    db.close()
  })
})

describe('runMigrations', () => {
  const dbName = getTestDBName('run-test')
  let testDb: IDBDatabase | null = null

  beforeEach(async () => {
    testDb = await createDBAtVersion(1, dbName)
  })

  afterEach(async () => {
    if (testDb) {
      testDb.close()
      testDb = null
    }
    await deleteTestDB(dbName)
  })

  it('updates version when no migrations needed', async () => {
    // Set initial version to 1
    await setSchemaVersion(testDb!, 1)
    await runMigrations(testDb!, 1, 1)
    const version = await getSchemaVersion(testDb!)
    expect(version).toBe(1)
  })

  it('runs data migrations in order', async () => {
    const executionOrder: number[] = []

    // Temporarily add test migrations
    const testMigrations: Migration[] = [
      {
        fromVersion: 1,
        toVersion: 2,
        description: 'Test migration 1→2',
        data: async () => {
          executionOrder.push(1)
        },
      },
      {
        fromVersion: 2,
        toVersion: 3,
        description: 'Test migration 2→3',
        data: async () => {
          executionOrder.push(2)
        },
      },
    ]

    // Override migrations array
    const originalMigrations = [...migrations]
    migrations.length = 0
    migrations.push(...testMigrations)

    try {
      await runMigrations(testDb!, 1, 3)
      expect(executionOrder).toEqual([1, 2])
      const version = await getSchemaVersion(testDb!)
      expect(version).toBe(3)
    } finally {
      // Restore original migrations
      migrations.length = 0
      migrations.push(...originalMigrations)
    }
  })

  it('stops on migration failure', async () => {
    const executionOrder: number[] = []

    const testMigrations: Migration[] = [
      {
        fromVersion: 1,
        toVersion: 2,
        description: 'Will succeed',
        data: async () => {
          executionOrder.push(1)
        },
      },
      {
        fromVersion: 2,
        toVersion: 3,
        description: 'Will fail',
        data: async () => {
          executionOrder.push(2)
          throw new Error('Migration failed')
        },
      },
      {
        fromVersion: 3,
        toVersion: 4,
        description: 'Should not run',
        data: async () => {
          executionOrder.push(3)
        },
      },
    ]

    const originalMigrations = [...migrations]
    migrations.length = 0
    migrations.push(...testMigrations)

    try {
      // Should not throw, but should stop at failure
      await runMigrations(testDb!, 1, 4)
      expect(executionOrder).toEqual([1, 2])
      // Version should be updated to last successful migration
      const version = await getSchemaVersion(testDb!)
      expect(version).toBe(2)
      // Failed migration should be recorded
      const failed = await getFailedMigration(testDb!)
      expect(failed).not.toBeNull()
      expect(failed!.value).toBe('v2→v3')
    } finally {
      migrations.length = 0
      migrations.push(...originalMigrations)
    }
  })

  it('migrates records with data migration', async () => {
    // Create v1 records
    const v1Videos = createMockVideosAtVersion(3, 1)
    await seedRecordsAtVersion(testDb!, v1Videos, 1)

    const testMigrations: Migration[] = [
      {
        fromVersion: 1,
        toVersion: 2,
        description: 'Add testField',
        data: async (db) => {
          return new Promise((resolve, reject) => {
            const tx = db.transaction('videos', 'readwrite')
            const store = tx.objectStore('videos')
            const request = store.openCursor()

            request.onsuccess = () => {
              const cursor = request.result
              if (cursor) {
                const video = cursor.value as CachedVideo & { testField?: string }
                if (video.cacheVersion < 2) {
                  video.testField = 'migrated'
                  video.cacheVersion = 2
                  cursor.update(video)
                }
                cursor.continue()
              } else {
                resolve()
              }
            }
            request.onerror = () => reject(request.error)
            tx.oncomplete = () => resolve()
          })
        },
      },
    ]

    const originalMigrations = [...migrations]
    migrations.length = 0
    migrations.push(...testMigrations)

    try {
      await runMigrations(testDb!, 1, 2)
      const records = await getAllRecords(testDb!)
      expect(records).toHaveLength(3)
      for (const record of records) {
        expect(record.cacheVersion).toBe(2)
        expect((record as unknown as { testField: string }).testField).toBe('migrated')
      }
    } finally {
      migrations.length = 0
      migrations.push(...originalMigrations)
    }
  })
})

describe('runStructuralMigrations', () => {
  const dbName = getTestDBName('structural-test')
  let testDb: IDBDatabase | null = null

  afterEach(async () => {
    if (testDb) {
      testDb.close()
      testDb = null
    }
    await deleteTestDB(dbName)
  })

  it('runs structural migrations during upgrade', async () => {
    let structuralRan = false

    const testMigrations: Migration[] = [
      {
        fromVersion: 1,
        toVersion: 2,
        description: 'Add test index',
        structural: (db, transaction) => {
          structuralRan = true
          const store = transaction.objectStore('videos')
          if (!store.indexNames.contains('by-test')) {
            store.createIndex('by-test', 'testField', { unique: false })
          }
        },
      },
    ]

    const originalMigrations = [...migrations]
    migrations.length = 0
    migrations.push(...testMigrations)

    // First create v1 database
    let v1Db: IDBDatabase | null = null
    try {
      v1Db = await createDBAtVersion(1, dbName)
      v1Db.close()
      v1Db = null

      // Now upgrade to v2 - this should trigger the structural migration
      testDb = await createDBAtVersion(2, dbName)
      expect(structuralRan).toBe(true)
      expect(testDb.objectStoreNames.contains('videos')).toBe(true)
    } finally {
      if (v1Db) {
        v1Db.close()
      }
      migrations.length = 0
      migrations.push(...originalMigrations)
    }
  })
})

describe('ensureLatestVersion (lazy migration)', () => {
  it('returns same video if already at current version', () => {
    const video = createMockVideoAtVersion(CURRENT_CACHE_VERSION)
    const result = ensureVideoAtLatestVersion(video)
    expect(result.cacheVersion).toBe(CURRENT_CACHE_VERSION)
    expect(result).toEqual(video)
  })

  it('updates version for legacy records', () => {
    const video = createMockVideoAtVersion(0)
    video.cacheVersion = 0 as unknown as number
    const result = ensureVideoAtLatestVersion(video)
    expect(result.cacheVersion).toBe(CURRENT_CACHE_VERSION)
  })

  it('does not mutate original video', () => {
    const video = createMockVideoAtVersion(0)
    video.cacheVersion = 0 as unknown as number
    const result = ensureVideoAtLatestVersion(video)
    expect(result).not.toBe(video)
    expect(video.cacheVersion).toBe(0)
    expect(result.cacheVersion).toBe(CURRENT_CACHE_VERSION)
  })
})

describe('Migration End-to-End', () => {
  const dbName = getTestDBName('e2e')

  afterEach(async () => {
    await deleteTestDB(dbName)
  })

  it('opens v1 database and sets up schema', async () => {
    const db = await createDBAtVersion(1, dbName)
    expect(db.objectStoreNames.contains('videos')).toBe(true)
    expect(db.objectStoreNames.contains('metadata')).toBe(true)
    db.close()
  })

  it('seeds records at specific version', async () => {
    const db = await createDBAtVersion(1, dbName)
    const videos = createMockVideosAtVersion(5, 1)
    await seedRecordsAtVersion(db, videos, 1)

    const records = await getAllRecords(db)
    expect(records).toHaveLength(5)
    for (const record of records) {
      expect(record.cacheVersion).toBe(1)
    }
    db.close()
  })

  it('verifies successful migration', async () => {
    const db = await createDBAtVersion(1, dbName)
    const videos = createMockVideosAtVersion(3, 1)
    await seedRecordsAtVersion(db, videos, 1)

    // Simulate migration by updating versions
    await setSchemaVersion(db, 1)

    const result = await verifyMigrationSuccess(db, 1)
    expect(result.success).toBe(true)
    expect(result.errors).toHaveLength(0)
    db.close()
  })

  it('detects version mismatches', async () => {
    const db = await createDBAtVersion(1, dbName)
    const videos = createMockVideosAtVersion(3, 1)
    await seedRecordsAtVersion(db, videos, 1)

    // Don't update schema version
    const result = await verifyMigrationSuccess(db, 2)
    expect(result.success).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
    db.close()
  })
})

describe('Migration Logging', () => {
  const dbName = getTestDBName('logging')
  let testDb: IDBDatabase | null = null
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    testDb = await createDBAtVersion(1, dbName)
    consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
  })

  afterEach(async () => {
    consoleSpy.mockRestore()
    if (testDb) {
      testDb.close()
      testDb = null
    }
    await deleteTestDB(dbName)
  })

  it('logs migration progress', async () => {
    const testMigrations: Migration[] = [
      {
        fromVersion: 1,
        toVersion: 2,
        description: 'Test logging migration',
        data: async () => {
          // No-op
        },
      },
    ]

    const originalMigrations = [...migrations]
    migrations.length = 0
    migrations.push(...testMigrations)

    try {
      await runMigrations(testDb!, 1, 2)
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Migrations] Running 1 migration(s)')
      )
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Migrations] Running: Test logging migration')
      )
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Migrations] Completed: v1 → v2')
      )
    } finally {
      migrations.length = 0
      migrations.push(...originalMigrations)
    }
  })
})

describe('Migration Error Handling', () => {
  const dbName = getTestDBName('error-handling')
  let testDb: IDBDatabase | null = null
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    testDb = await createDBAtVersion(1, dbName)
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(async () => {
    errorSpy.mockRestore()
    if (testDb) {
      testDb.close()
      testDb = null
    }
    await deleteTestDB(dbName)
  })

  it('logs errors but does not throw', async () => {
    const testMigrations: Migration[] = [
      {
        fromVersion: 1,
        toVersion: 2,
        description: 'Failing migration',
        data: async () => {
          throw new Error('Test error')
        },
      },
    ]

    const originalMigrations = [...migrations]
    migrations.length = 0
    migrations.push(...testMigrations)

    try {
      // Should not throw
      await expect(runMigrations(testDb!, 1, 2)).resolves.not.toThrow()
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Migrations] Failed:'),
        expect.any(Error)
      )
    } finally {
      migrations.length = 0
      migrations.push(...originalMigrations)
    }
  })
})
