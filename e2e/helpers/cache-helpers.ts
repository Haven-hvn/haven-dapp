/**
 * Cache E2E Test Helpers
 *
 * Utility functions for cache-related end-to-end tests.
 * Provides helpers for seeding, reading, and clearing IndexedDB cache data.
 *
 * @example
 * ```typescript
 * import { seedCache, readCache, clearAllCaches, createTestCachedVideo } from './helpers/cache-helpers'
 *
 * test('my test', async ({ page }) => {
 *   const video = createTestCachedVideo({ title: 'Test Video' })
 *   await seedCache(page, '0x1234...', [video])
 *   // ... test logic
 *   await clearAllCaches(page)
 * })
 * ```
 */

import type { Page } from '@playwright/test'

/**
 * Default wallet address for testing
 */
export const TEST_WALLET_ADDRESS = '0xabcdef1234567890abcdef1234567890abcdef12'

/**
 * Second wallet address for cross-wallet tests
 */
export const TEST_WALLET_ADDRESS_2 = '0xfedcba0987654321fedcba0987654321fedcba09'

/**
 * Seed IndexedDB with test cache data
 *
 * Creates the cache database and populates it with test videos.
 * Also creates the metadata store and sets initial sync time.
 *
 * @param page - Playwright page object
 * @param walletAddress - Wallet address to seed cache for
 * @param videos - Array of CachedVideo objects to seed
 * @returns Promise that resolves when seeding is complete
 *
 * @example
 * ```typescript
 * const video = createTestCachedVideo({ title: 'My Video' })
 * await seedCache(page, '0x1234...', [video])
 * ```
 */
export async function seedCache(
  page: Page,
  walletAddress: string,
  videos: Record<string, unknown>[]
): Promise<void> {
  await page.evaluate(
    async ({ address, videos }) => {
      const dbName = `haven-cache-${address.toLowerCase()}`

      return new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(dbName, 1)

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result

          // Create videos store with indexes
          if (!db.objectStoreNames.contains('videos')) {
            const store = db.createObjectStore('videos', { keyPath: 'id' })
            store.createIndex('by-owner', 'owner', { unique: false })
            store.createIndex('by-cached-at', 'cachedAt', { unique: false })
            store.createIndex('by-last-synced', 'lastSyncedAt', { unique: false })
            store.createIndex('by-status', 'arkivEntityStatus', { unique: false })
          }

          // Create metadata store
          if (!db.objectStoreNames.contains('metadata')) {
            db.createObjectStore('metadata', { keyPath: 'key' })
          }
        }

        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction(['videos', 'metadata'], 'readwrite')
          const videoStore = tx.objectStore('videos')
          const metaStore = tx.objectStore('metadata')

          // Add all videos
          for (const video of videos) {
            videoStore.put(video)
          }

          // Set initial sync time
          metaStore.put({
            key: 'lastFullSync',
            value: Date.now(),
            updatedAt: Date.now(),
          })

          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onerror = () => {
            db.close()
            reject(tx.error)
          }
        }

        request.onerror = () => reject(request.error)
      })
    },
    { address: walletAddress, videos }
  )
}

/**
 * Read all cached videos from IndexedDB
 *
 * @param page - Playwright page object
 * @param walletAddress - Wallet address to read cache for
 * @returns Promise resolving to array of cached videos
 *
 * @example
 * ```typescript
 * const videos = await readCache(page, '0x1234...')
 * expect(videos).toHaveLength(5)
 * ```
 */
export async function readCache(
  page: Page,
  walletAddress: string
): Promise<Record<string, unknown>[]> {
  return page.evaluate(async (address) => {
    const dbName = `haven-cache-${address.toLowerCase()}`

    return new Promise<Record<string, unknown>[]>((resolve, reject) => {
      const request = indexedDB.open(dbName)

      request.onsuccess = () => {
        const db = request.result

        if (!db.objectStoreNames.contains('videos')) {
          resolve([])
          return
        }

        const tx = db.transaction('videos', 'readonly')
        const getAll = tx.objectStore('videos').getAll()

        getAll.onsuccess = () => {
          db.close()
          resolve(getAll.result)
        }
        getAll.onerror = () => {
          db.close()
          reject(getAll.error)
        }
      }

      request.onerror = () => reject(request.error)
    })
  }, walletAddress)
}

/**
 * Get cache statistics from IndexedDB
 *
 * @param page - Playwright page object
 * @param walletAddress - Wallet address to get stats for
 * @returns Promise resolving to cache statistics
 *
 * @example
 * ```typescript
 * const stats = await getCacheStats(page, '0x1234...')
 * expect(stats.totalVideos).toBe(10)
 * ```
 */
export async function getCacheStats(
  page: Page,
  walletAddress: string
): Promise<{
  totalVideos: number
  activeVideos: number
  expiredVideos: number
  lastFullSync: number | null
}> {
  return page.evaluate(async (address) => {
    const dbName = `haven-cache-${address.toLowerCase()}`

    return new Promise<{
      totalVideos: number
      activeVideos: number
      expiredVideos: number
      lastFullSync: number | null
    }>((resolve, reject) => {
      const request = indexedDB.open(dbName)

      request.onsuccess = () => {
        const db = request.result

        if (!db.objectStoreNames.contains('videos')) {
          resolve({ totalVideos: 0, activeVideos: 0, expiredVideos: 0, lastFullSync: null })
          return
        }

        const tx = db.transaction(['videos', 'metadata'], 'readonly')
        const videoStore = tx.objectStore('videos')
        const metaStore = tx.objectStore('metadata')

        const getAll = videoStore.getAll()
        const getLastSync = metaStore.get('lastFullSync')

        Promise.all([
          new Promise<Record<string, unknown>[]>((res, rej) => {
            getAll.onsuccess = () => res(getAll.result)
            getAll.onerror = () => rej(getAll.error)
          }),
          new Promise<number | null>((res) => {
            getLastSync.onsuccess = () => {
              const result = getLastSync.result as { value: number } | undefined
              res(result?.value ?? null)
            }
            getLastSync.onerror = () => res(null)
          }),
        ])
          .then(([videos, lastFullSync]) => {
            db.close()
            const activeVideos = videos.filter(
              (v) => v.arkivEntityStatus === 'active'
            ).length
            const expiredVideos = videos.filter(
              (v) => v.arkivEntityStatus === 'expired'
            ).length
            resolve({
              totalVideos: videos.length,
              activeVideos,
              expiredVideos,
              lastFullSync,
            })
          })
          .catch((err) => {
            db.close()
            reject(err)
          })
      }

      request.onerror = () => reject(request.error)
    })
  }, walletAddress)
}

/**
 * Clear all cache databases
 *
 * Deletes all IndexedDB databases that start with 'haven-cache-'
 *
 * @param page - Playwright page object
 * @returns Promise that resolves when all caches are cleared
 *
 * @example
 * ```typescript
 * await clearAllCaches(page)
 * ```
 */
export async function clearAllCaches(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const dbs = await indexedDB.databases()
    for (const db of dbs) {
      if (db.name?.startsWith('haven-cache-')) {
        indexedDB.deleteDatabase(db.name)
      }
    }
  })
}

/**
 * Clear cache for a specific wallet
 *
 * @param page - Playwright page object
 * @param walletAddress - Wallet address to clear cache for
 * @returns Promise that resolves when cache is cleared
 */
export async function clearWalletCache(
  page: Page,
  walletAddress: string
): Promise<void> {
  await page.evaluate(async (address) => {
    const dbName = `haven-cache-${address.toLowerCase()}`
    indexedDB.deleteDatabase(dbName)
  }, walletAddress)
}

/**
 * Create a mock cached video for testing
 *
 * Creates a complete CachedVideo object with sensible defaults.
 * Override any field by passing it in the overrides object.
 *
 * @param overrides - Object with fields to override
 * @returns A complete CachedVideo object
 *
 * @example
 * ```typescript
 * const video = createTestCachedVideo({
 *   title: 'My Custom Title',
 *   arkivEntityStatus: 'expired',
 * })
 * ```
 */
export function createTestCachedVideo(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  const now = Date.now()
  const id = '0x' + Math.random().toString(16).slice(2, 18)

  return {
    // Core fields
    id,
    owner: TEST_WALLET_ADDRESS,
    title: 'Test Video',
    description: 'A test video for E2E testing',
    duration: 120,

    // Storage
    filecoinCid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
    encryptedCid: undefined,

    // Encryption
    isEncrypted: false,
    litEncryptionMetadata: undefined,

    // AI analysis
    hasAiData: false,
    vlmJsonCid: undefined,

    // Minting
    mintId: undefined,

    // Source tracking
    sourceUri: undefined,
    creatorHandle: 'testuser',

    // Timestamps
    createdAt: now - 86400000, // 1 day ago
    updatedAt: undefined,

    // Variants
    codecVariants: undefined,
    segmentMetadata: undefined,

    // Cache metadata
    cachedAt: now - 3600000, // 1 hour ago
    lastSyncedAt: now - 3600000,
    lastAccessedAt: now - 1800000, // 30 minutes ago
    cacheVersion: 1,

    // Arkiv status
    arkivEntityStatus: 'active',
    arkivEntityKey: id,
    expiresAtBlock: undefined,

    // Sync metadata
    syncHash: undefined,
    isDirty: false,

    // Video content cache
    videoCacheStatus: 'not-cached',
    videoCachedAt: undefined,

    // Apply overrides
    ...overrides,
  }
}

/**
 * Create a mock expired cached video
 *
 * Convenience wrapper that creates a video with arkivEntityStatus: 'expired'
 *
 * @param overrides - Object with fields to override
 * @returns A CachedVideo object marked as expired
 */
export function createExpiredCachedVideo(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return createTestCachedVideo({
    arkivEntityStatus: 'expired',
    title: 'Expired Test Video',
    ...overrides,
  })
}

/**
 * Create a mock expiring-soon cached video
 *
 * Convenience wrapper that creates a video with expiresAtBlock set to soon
 *
 * @param overrides - Object with fields to override
 * @returns A CachedVideo object that will expire soon
 */
export function createExpiringSoonCachedVideo(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  // Current block + 1000 blocks (~3 hours at 12s blocks)
  const currentBlock = 1000000
  const expiresAtBlock = currentBlock + 1000

  return createTestCachedVideo({
    expiresAtBlock,
    title: 'Expiring Soon Test Video',
    ...overrides,
  })
}

/**
 * Create multiple test cached videos
 *
 * @param count - Number of videos to create
 * @param overrides - Base overrides for all videos
 * @param statusGenerator - Optional function to generate status for each video
 * @returns Array of CachedVideo objects
 */
export function createTestCachedVideos(
  count: number,
  overrides: Record<string, unknown> = {},
  statusGenerator?: (index: number) => 'active' | 'expired'
): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, i) => {
    const status = statusGenerator ? statusGenerator(i) : 'active'
    return createTestCachedVideo({
      id: `0x${Math.random().toString(16).slice(2, 18)}`,
      title: `Test Video ${i + 1}`,
      arkivEntityStatus: status,
      ...overrides,
    })
  })
}

/**
 * Block Arkiv network requests
 *
 * Intercepts and aborts requests to Arkiv API endpoints
 *
 * @param page - Playwright page object
 * @returns Promise that resolves when route is set up
 */
export async function blockArkivRequests(page: Page): Promise<void> {
  await page.route('**/arkiv/**', async (route) => {
    await route.abort('internetdisconnected')
  })
}

/**
 * Mock Arkiv API responses
 *
 * Intercepts Arkiv API requests and returns mock responses
 *
 * @param page - Playwright page object
 * @param mockData - Mock data to return
 * @returns Promise that resolves when route is set up
 */
export async function mockArkivResponses(
  page: Page,
  mockData: Record<string, unknown>[]
): Promise<void> {
  await page.route('**/arkiv/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockData),
    })
  })
}

/**
 * Wait for IndexedDB to be ready
 *
 * Polls until the cache database exists and is accessible
 *
 * @param page - Playwright page object
 * @param walletAddress - Wallet address to wait for
 * @param timeout - Maximum time to wait in ms (default: 5000)
 * @returns Promise that resolves when database is ready
 */
export async function waitForCacheReady(
  page: Page,
  walletAddress: string,
  timeout = 5000
): Promise<void> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    const isReady = await page.evaluate(async (address) => {
      const dbName = `haven-cache-${address.toLowerCase()}`

      try {
        const dbs = await indexedDB.databases()
        return dbs.some((db) => db.name === dbName)
      } catch {
        return false
      }
    }, walletAddress)

    if (isReady) {
      return
    }

    await page.waitForTimeout(100)
  }

  throw new Error(`Cache not ready after ${timeout}ms`)
}

/**
 * Check if a video exists in cache
 *
 * @param page - Playwright page object
 * @param walletAddress - Wallet address to check
 * @param videoId - Video ID to look for
 * @returns Promise resolving to true if video exists
 */
export async function hasVideoInCache(
  page: Page,
  walletAddress: string,
  videoId: string
): Promise<boolean> {
  const videos = await readCache(page, walletAddress)
  return videos.some((v) => v.id === videoId)
}

/**
 * Get a specific video from cache
 *
 * @param page - Playwright page object
 * @param walletAddress - Wallet address to read from
 * @param videoId - Video ID to get
 * @returns Promise resolving to the video or undefined
 */
export async function getVideoFromCache(
  page: Page,
  walletAddress: string,
  videoId: string
): Promise<Record<string, unknown> | undefined> {
  const videos = await readCache(page, walletAddress)
  return videos.find((v) => v.id === videoId)
}

/**
 * Update a video in cache
 *
 * @param page - Playwright page object
 * @param walletAddress - Wallet address
 * @param videoId - Video ID to update
 * @param updates - Fields to update
 * @returns Promise that resolves when update is complete
 */
export async function updateVideoInCache(
  page: Page,
  walletAddress: string,
  videoId: string,
  updates: Record<string, unknown>
): Promise<void> {
  const video = await getVideoFromCache(page, walletAddress, videoId)
  if (!video) {
    throw new Error(`Video ${videoId} not found in cache`)
  }

  await page.evaluate(
    async ({ address, videoId, updates }) => {
      const dbName = `haven-cache-${address.toLowerCase()}`

      return new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(dbName)

        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction('videos', 'readwrite')
          const store = tx.objectStore('videos')

          const getReq = store.get(videoId)

          getReq.onsuccess = () => {
            const existing = getReq.result
            if (!existing) {
              db.close()
              reject(new Error(`Video ${videoId} not found`))
              return
            }

            const updated = { ...existing, ...updates }
            const putReq = store.put(updated)

            putReq.onsuccess = () => {
              db.close()
              resolve()
            }
            putReq.onerror = () => {
              db.close()
              reject(putReq.error)
            }
          }

          getReq.onerror = () => {
            db.close()
            reject(getReq.error)
          }
        }

        request.onerror = () => reject(request.error)
      })
    },
    { address: walletAddress, videoId, updates }
  )
}

/**
 * Export cache data as JSON string
 *
 * @param page - Playwright page object
 * @param walletAddress - Wallet address to export
 * @returns Promise resolving to export JSON string
 */
export async function exportCacheAsJSON(
  page: Page,
  walletAddress: string
): Promise<string> {
  return page.evaluate(async (address) => {
    const dbName = `haven-cache-${address.toLowerCase()}`

    return new Promise<string>((resolve, reject) => {
      const request = indexedDB.open(dbName)

      request.onsuccess = () => {
        const db = request.result
        const tx = db.transaction(['videos', 'metadata'], 'readonly')
        const videoStore = tx.objectStore('videos')
        const metaStore = tx.objectStore('metadata')

        const getVideos = videoStore.getAll()
        const getMetadata = metaStore.getAll()

        Promise.all([
          new Promise<Record<string, unknown>[]>((res, rej) => {
            getVideos.onsuccess = () => res(getVideos.result)
            getVideos.onerror = () => rej(getVideos.error)
          }),
          new Promise<Record<string, unknown>[]>((res, rej) => {
            getMetadata.onsuccess = () => res(getMetadata.result)
            getMetadata.onerror = () => rej(getMetadata.error)
          }),
        ])
          .then(([videos, metadata]) => {
            db.close()
            const exportData = {
              version: 1,
              exportedAt: new Date().toISOString(),
              appVersion: '1.0.0',
              walletAddress: address.toLowerCase(),
              videoCount: videos.length,
              videos,
              metadata,
              checksum: 'test-checksum',
            }
            resolve(JSON.stringify(exportData, null, 2))
          })
          .catch((err) => {
            db.close()
            reject(err)
          })
      }

      request.onerror = () => reject(request.error)
    })
  }, walletAddress)
}
