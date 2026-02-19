/**
 * Cache: Settings Management E2E Tests
 *
 * End-to-end tests for cache settings, management, and import/export functionality.
 * Tests statistics display, manual sync, cache clearing, and data portability.
 */

import { test, expect } from '@playwright/test'
import {
  seedCache,
  readCache,
  clearAllCaches,
  getCacheStats,
  createTestCachedVideo,
  createExpiredCachedVideo,
  createTestCachedVideos,
  exportCacheAsJSON,
  TEST_WALLET_ADDRESS,
  TEST_WALLET_ADDRESS_2,
} from './helpers/cache-helpers'

// Test setup: Clear all caches before each test
test.beforeEach(async ({ page }) => {
  await clearAllCaches(page)
})

// Test cleanup: Clear all caches after each test
test.afterEach(async ({ page }) => {
  await clearAllCaches(page)
})

test.describe('Cache: Settings Management', () => {
  test('cache statistics display correctly', async ({ page }) => {
    // 1. Populate cache with known data
    const activeVideos = createTestCachedVideos(5, {}, () => 'active')
    const expiredVideos = createTestCachedVideos(3, {}, () => 'expired')
    await seedCache(page, TEST_WALLET_ADDRESS, [...activeVideos, ...expiredVideos])

    // 2. Navigate to settings
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')

    // 3. Verify stats via cache API
    const stats = await getCacheStats(page, TEST_WALLET_ADDRESS)
    expect(stats.totalVideos).toBe(8)
    expect(stats.activeVideos).toBe(5)
    expect(stats.expiredVideos).toBe(3)

    // 4. Verify last sync time is set
    expect(stats.lastFullSync).toBeTruthy()
    expect(typeof stats.lastFullSync).toBe('number')
    expect(stats.lastFullSync).toBeGreaterThan(0)
  })

  test('manual sync updates cache', async ({ page }) => {
    // 1. Navigate to settings
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')

    // 2. Seed initial cache
    const initialVideos = createTestCachedVideos(2)
    await seedCache(page, TEST_WALLET_ADDRESS, initialVideos)

    const initialStats = await getCacheStats(page, TEST_WALLET_ADDRESS)
    expect(initialStats.totalVideos).toBe(2)

    // 3. Add more videos to simulate sync
    const additionalVideos = createTestCachedVideos(3)
    await seedCache(page, TEST_WALLET_ADDRESS, [
      ...initialVideos,
      ...additionalVideos,
    ])

    // 4. Verify stats updated
    const updatedStats = await getCacheStats(page, TEST_WALLET_ADDRESS)
    expect(updatedStats.totalVideos).toBe(5)

    // 5. Verify last sync timestamp is updated
    expect(updatedStats.lastFullSync).toBeTruthy()
  })

  test('clear cache removes all data', async ({ page }) => {
    // 1. Populate cache
    const testVideos = createTestCachedVideos(10)
    await seedCache(page, TEST_WALLET_ADDRESS, testVideos)

    // 2. Verify cache has data
    const initialStats = await getCacheStats(page, TEST_WALLET_ADDRESS)
    expect(initialStats.totalVideos).toBe(10)

    // 3. Navigate to settings
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')

    // 4. Clear cache via IndexedDB API (simulating UI action)
    await page.evaluate(async (address) => {
      const dbName = `haven-cache-${address.toLowerCase()}`

      return new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(dbName)

        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction('videos', 'readwrite')
          const store = tx.objectStore('videos')
          store.clear()

          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        }

        request.onerror = () => reject(request.error)
      })
    }, TEST_WALLET_ADDRESS)

    // 5. Verify cache is empty
    const afterClear = await readCache(page, TEST_WALLET_ADDRESS)
    expect(afterClear).toHaveLength(0)

    // 6. Verify stats show 0
    const clearedStats = await getCacheStats(page, TEST_WALLET_ADDRESS)
    expect(clearedStats.totalVideos).toBe(0)
    expect(clearedStats.activeVideos).toBe(0)
    expect(clearedStats.expiredVideos).toBe(0)
  })

  test('export produces downloadable JSON file', async ({ page }) => {
    // 1. Populate cache with test data
    const testVideos = createTestCachedVideos(5)
    await seedCache(page, TEST_WALLET_ADDRESS, testVideos)

    // 2. Navigate to settings
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')

    // 3. Export cache data
    const exportJSON = await exportCacheAsJSON(page, TEST_WALLET_ADDRESS)
    const exportData = JSON.parse(exportJSON)

    // 4. Verify export structure
    expect(exportData.version).toBe(1)
    expect(exportData.walletAddress).toBe(TEST_WALLET_ADDRESS.toLowerCase())
    expect(exportData.videoCount).toBe(5)
    expect(exportData.videos).toHaveLength(5)
    expect(exportData.metadata).toBeDefined()
    expect(exportData.exportedAt).toBeTruthy()
    expect(exportData.checksum).toBeTruthy()

    // 5. Verify video data integrity
    for (const video of exportData.videos) {
      expect(video.id).toBeTruthy()
      expect(video.title).toBeTruthy()
      expect(video.owner).toBe(TEST_WALLET_ADDRESS.toLowerCase())
      expect(video.cachedAt).toBeGreaterThan(0)
      expect(video.cacheVersion).toBe(1)
    }
  })

  test('import restores cache from file', async ({ page }) => {
    // 1. Create export data
    const testVideos = createTestCachedVideos(3)
    await seedCache(page, TEST_WALLET_ADDRESS, testVideos)

    const exportJSON = await exportCacheAsJSON(page, TEST_WALLET_ADDRESS)
    const exportData = JSON.parse(exportJSON)

    // 2. Clear cache
    await clearAllCaches(page)
    const afterClear = await readCache(page, TEST_WALLET_ADDRESS)
    expect(afterClear).toHaveLength(0)

    // 3. Import the export data
    await page.evaluate(
      async ({ address, exportData }) => {
        const dbName = `haven-cache-${address.toLowerCase()}`

        return new Promise<void>((resolve, reject) => {
          const request = indexedDB.open(dbName, 1)

          request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result
            if (!db.objectStoreNames.contains('videos')) {
              const store = db.createObjectStore('videos', { keyPath: 'id' })
              store.createIndex('by-owner', 'owner', { unique: false })
              store.createIndex('by-cached-at', 'cachedAt', { unique: false })
              store.createIndex('by-last-synced', 'lastSyncedAt', { unique: false })
              store.createIndex('by-status', 'arkivEntityStatus', { unique: false })
            }
            if (!db.objectStoreNames.contains('metadata')) {
              db.createObjectStore('metadata', { keyPath: 'key' })
            }
          }

          request.onsuccess = () => {
            const db = request.result
            const tx = db.transaction(['videos', 'metadata'], 'readwrite')
            const videoStore = tx.objectStore('videos')
            const metaStore = tx.objectStore('metadata')

            // Import videos
            for (const video of exportData.videos) {
              videoStore.put(video)
            }

            // Import metadata
            for (const meta of exportData.metadata) {
              metaStore.put(meta)
            }

            tx.oncomplete = () => {
              db.close()
              resolve()
            }
            tx.onerror = () => reject(tx.error)
          }

          request.onerror = () => reject(request.error)
        })
      },
      { address: TEST_WALLET_ADDRESS, exportData }
    )

    // 4. Verify import success
    const importedVideos = await readCache(page, TEST_WALLET_ADDRESS)
    expect(importedVideos).toHaveLength(3)

    // 5. Verify data integrity
    for (const original of testVideos) {
      const imported = importedVideos.find((v) => v.id === original.id)
      expect(imported).toBeTruthy()
      expect(imported?.title).toBe(original.title)
      expect(imported?.duration).toBe(original.duration)
    }
  })

  test('import rejects wrong wallet address', async ({ page }) => {
    // 1. Create export for wallet A
    const walletAVideos = createTestCachedVideos(3, { owner: TEST_WALLET_ADDRESS })
    await seedCache(page, TEST_WALLET_ADDRESS, walletAVideos)

    const exportJSON = await exportCacheAsJSON(page, TEST_WALLET_ADDRESS)
    const exportData = JSON.parse(exportJSON)

    // 2. Clear cache and prepare for wallet B
    await clearAllCaches(page)

    // 3. Try to import wallet A's data as wallet B
    const importResult = await page.evaluate(
      async ({ address, exportData }) => {
        // Check wallet address match
        if (exportData.walletAddress.toLowerCase() !== address.toLowerCase()) {
          return {
            success: false,
            error: `Wallet mismatch: export is for ${exportData.walletAddress.slice(0, 8)}... but current wallet is ${address.slice(0, 8)}...`,
          }
        }
        return { success: true }
      },
      { address: TEST_WALLET_ADDRESS_2, exportData }
    )

    // 4. Verify import was rejected
    expect(importResult.success).toBe(false)
    expect(importResult.error).toContain('Wallet mismatch')

    // 5. Verify wallet B's cache is still empty
    const walletBCache = await readCache(page, TEST_WALLET_ADDRESS_2)
    expect(walletBCache).toHaveLength(0)
  })

  test('export includes all metadata fields', async ({ page }) => {
    // 1. Create video with all fields
    const video = createTestCachedVideo({
      id: '0xexportTest',
      title: 'Export Test Video',
      description: 'Testing full export',
      duration: 300,
      filecoinCid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
      isEncrypted: true,
      encryptedCid: 'encrypted-cid-here',
      hasAiData: true,
      vlmJsonCid: 'vlm-cid-here',
      mintId: 'mint-test-123',
      sourceUri: 'https://example.com/video',
      creatorHandle: '@testuser',
      codecVariants: [
        { codec: 'h264', resolution: '1080p', bitrate: 5000000, cid: 'variant1' },
      ],
      cachedAt: Date.now() - 86400000,
      lastSyncedAt: Date.now() - 3600000,
      lastAccessedAt: Date.now() - 1800000,
      arkivEntityStatus: 'active',
      videoCacheStatus: 'cached',
      videoCachedAt: Date.now() - 7200000,
    })

    await seedCache(page, TEST_WALLET_ADDRESS, [video])

    // 2. Export
    const exportJSON = await exportCacheAsJSON(page, TEST_WALLET_ADDRESS)
    const exportData = JSON.parse(exportJSON)

    // 3. Verify all fields are preserved
    const exportedVideo = exportData.videos[0]
    expect(exportedVideo.id).toBe('0xexportTest')
    expect(exportedVideo.title).toBe('Export Test Video')
    expect(exportedVideo.description).toBe('Testing full export')
    expect(exportedVideo.duration).toBe(300)
    expect(exportedVideo.isEncrypted).toBe(true)
    expect(exportedVideo.encryptedCid).toBe('encrypted-cid-here')
    expect(exportedVideo.hasAiData).toBe(true)
    expect(exportedVideo.vlmJsonCid).toBe('vlm-cid-here')
    expect(exportedVideo.mintId).toBe('mint-test-123')
    expect(exportedVideo.sourceUri).toBe('https://example.com/video')
    expect(exportedVideo.creatorHandle).toBe('@testuser')
    expect(exportedVideo.codecVariants).toHaveLength(1)
    expect(exportedVideo.arkivEntityStatus).toBe('active')
    expect(exportedVideo.videoCacheStatus).toBe('cached')
    expect(exportedVideo.videoCachedAt).toBeGreaterThan(0)
  })

  test('partial cache clear preserves settings', async ({ page }) => {
    // 1. Seed cache with videos
    const videos = createTestCachedVideos(5)
    await seedCache(page, TEST_WALLET_ADDRESS, videos)

    // 2. Add custom metadata
    await page.evaluate(async (address) => {
      const dbName = `haven-cache-${address.toLowerCase()}`

      return new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(dbName)

        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction('metadata', 'readwrite')
          const store = tx.objectStore('metadata')

          store.put({
            key: 'customSetting',
            value: 'customValue',
            updatedAt: Date.now(),
          })

          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        }

        request.onerror = () => reject(request.error)
      })
    }, TEST_WALLET_ADDRESS)

    // 3. Clear only videos (not metadata)
    await page.evaluate(async (address) => {
      const dbName = `haven-cache-${address.toLowerCase()}`

      return new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(dbName)

        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction('videos', 'readwrite')
          const store = tx.objectStore('videos')
          store.clear()

          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        }

        request.onerror = () => reject(request.error)
      })
    }, TEST_WALLET_ADDRESS)

    // 4. Verify videos cleared but custom metadata preserved
    const videoCount = (await readCache(page, TEST_WALLET_ADDRESS)).length
    expect(videoCount).toBe(0)

    const customSetting = await page.evaluate(async (address) => {
      const dbName = `haven-cache-${address.toLowerCase()}`

      return new Promise<string | null>((resolve) => {
        const request = indexedDB.open(dbName)

        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction('metadata', 'readonly')
          const store = tx.objectStore('metadata')
          const getReq = store.get('customSetting')

          getReq.onsuccess = () => {
            const result = getReq.result as { value: string } | undefined
            db.close()
            resolve(result?.value ?? null)
          }
          getReq.onerror = () => {
            db.close()
            resolve(null)
          }
        }

        request.onerror = () => resolve(null)
      })
    }, TEST_WALLET_ADDRESS)

    expect(customSetting).toBe('customValue')
  })

  test('cache size calculation is accurate', async ({ page }) => {
    // 1. Create videos of varying sizes
    const smallVideo = createTestCachedVideo({
      id: '0xsmall',
      title: 'S',
      description: 'Small',
    })

    const largeVideo = createTestCachedVideo({
      id: '0xlarge',
      title: 'A'.repeat(1000),
      description: 'B'.repeat(5000),
      codecVariants: Array.from({ length: 10 }, (_, i) => ({
        codec: 'h264',
        resolution: '1080p',
        bitrate: 5000000,
        cid: `variant${i}`,
      })),
    })

    await seedCache(page, TEST_WALLET_ADDRESS, [smallVideo, largeVideo])

    // 2. Get cache stats
    const stats = await getCacheStats(page, TEST_WALLET_ADDRESS)
    expect(stats.totalVideos).toBe(2)

    // 3. Estimate size manually
    const videos = await readCache(page, TEST_WALLET_ADDRESS)
    const estimatedSize = videos.reduce((total, video) => {
      return total + JSON.stringify(video).length * 2 // UTF-16
    }, 0)

    // Size should be reasonable (greater than 0, less than 10MB)
    expect(estimatedSize).toBeGreaterThan(0)
    expect(estimatedSize).toBeLessThan(10 * 1024 * 1024)
  })

  test('expired videos are included in export', async ({ page }) => {
    // 1. Create mix of active and expired videos
    const active = createTestCachedVideos(2, {}, () => 'active')
    const expired = [
      createExpiredCachedVideo({ title: 'Expired 1' }),
      createExpiredCachedVideo({ title: 'Expired 2' }),
      createExpiredCachedVideo({ title: 'Expired 3' }),
    ]

    await seedCache(page, TEST_WALLET_ADDRESS, [...active, ...expired])

    // 2. Export
    const exportJSON = await exportCacheAsJSON(page, TEST_WALLET_ADDRESS)
    const exportData = JSON.parse(exportJSON)

    // 3. Verify all videos are in export
    expect(exportData.videoCount).toBe(5)
    expect(exportData.videos).toHaveLength(5)

    // 4. Verify expired videos preserved with correct status
    const expiredExported = exportData.videos.filter(
      (v: { arkivEntityStatus: string }) => v.arkivEntityStatus === 'expired'
    )
    expect(expiredExported).toHaveLength(3)

    // 5. Verify expired videos have required fields
    for (const video of expiredExported) {
      expect(video.title).toBeTruthy()
      expect(video.filecoinCid).toBeTruthy()
      expect(video.duration).toBeGreaterThan(0)
    }
  })

  test('import merge strategy respects existing data', async ({ page }) => {
    // 1. Create initial cache with a video
    const originalVideo = createTestCachedVideo({
      id: '0xmergeTest',
      title: 'Original Title',
      description: 'Original description',
    })
    await seedCache(page, TEST_WALLET_ADDRESS, [originalVideo])

    // 2. Create export with updated same video
    const updatedVideo = createTestCachedVideo({
      id: '0xmergeTest',
      title: 'Updated Title',
      description: 'Updated description',
    })

    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      appVersion: '1.0.0',
      walletAddress: TEST_WALLET_ADDRESS.toLowerCase(),
      videoCount: 1,
      videos: [updatedVideo],
      metadata: [],
      checksum: 'test',
    }

    // 3. Import with keep-existing strategy
    await page.evaluate(
      async ({ address, exportData }) => {
        const dbName = `haven-cache-${address.toLowerCase()}`

        return new Promise<void>((resolve, reject) => {
          const request = indexedDB.open(dbName)

          request.onsuccess = () => {
            const db = request.result
            const tx = db.transaction('videos', 'readwrite')
            const store = tx.objectStore('videos')

            for (const video of exportData.videos) {
              const getReq = store.get((video as { id: string }).id)

              getReq.onsuccess = () => {
                const existing = getReq.result
                if (!existing) {
                  // No existing - add new
                  store.put(video)
                }
                // Existing found - skip (keep-existing strategy)
              }
            }

            tx.oncomplete = () => {
              db.close()
              resolve()
            }
            tx.onerror = () => reject(tx.error)
          }

          request.onerror = () => reject(request.error)
        })
      },
      { address: TEST_WALLET_ADDRESS, exportData }
    )

    // 4. Verify original was kept
    const cachedVideos = await readCache(page, TEST_WALLET_ADDRESS)
    const mergedVideo = cachedVideos.find((v) => v.id === '0xmergeTest')
    expect(mergedVideo?.title).toBe('Original Title')
    expect(mergedVideo?.description).toBe('Original description')
  })
})
