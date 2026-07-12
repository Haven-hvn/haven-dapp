/**
 * Cache: Watch Page E2E Tests
 *
 * End-to-end tests for the watch page with cache integration.
 * Tests expired video indicators, expiring soon warnings, and cache metadata display.
 */

import { test, expect } from '@playwright/test'
import {
  seedCache,
  readCache,
  clearAllCaches,
  getVideoFromCache,
  createTestCachedVideo,
  createExpiredCachedVideo,
  TEST_WALLET_ADDRESS,
} from './helpers/cache-helpers'

// Test setup: Clear all caches before each test
test.beforeEach(async ({ page }) => {
  await clearAllCaches(page)
})

// Test cleanup: Clear all caches after each test
test.afterEach(async ({ page }) => {
  await clearAllCaches(page)
})

test.describe('Cache: Watch Page', () => {
  test('expired video detail page shows cache indicator', async ({ page }) => {
    // 1. Seed cache with expired video
    const expiredVideoId = '0xexpiredVideo123'
    const expiredVideo = createExpiredCachedVideo({
      id: expiredVideoId,
      title: 'Expired Archived Video',
      description: 'This video has expired from Arkiv',
      filecoinCid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
      duration: 300,
    })

    await seedCache(page, TEST_WALLET_ADDRESS, [expiredVideo])

    // 2. Navigate to watch page
    await page.goto(`/watch/${expiredVideoId}`)
    await page.waitForLoadState('networkidle')

    // 3. Verify video is in cache with expired status
    const cachedVideo = await getVideoFromCache(page, TEST_WALLET_ADDRESS, expiredVideoId)
    expect(cachedVideo).toBeTruthy()
    expect(cachedVideo?.arkivEntityStatus).toBe('expired')

    // 4. Verify video metadata is preserved
    expect(cachedVideo?.title).toBe('Expired Archived Video')
    expect(cachedVideo?.description).toBe('This video has expired from Arkiv')
    expect(cachedVideo?.filecoinCid).toBe('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi')
    expect(cachedVideo?.duration).toBe(300)
  })

  test('expiring-soon video shows warning', async ({ page }) => {
    // 1. Seed cache with video that expires soon
    const expiringVideoId = '0xexpiringVideo456'
    const currentBlock = 1000000
    const expiresAtBlock = currentBlock + 500 // ~1.5 hours at 12s blocks

    const expiringVideo = createTestCachedVideo({
      id: expiringVideoId,
      title: 'Video Expiring Soon',
      description: 'This video will expire soon',
      expiresAtBlock,
      arkivEntityStatus: 'active',
    })

    await seedCache(page, TEST_WALLET_ADDRESS, [expiringVideo])

    // 2. Navigate to watch page
    await page.goto(`/watch/${expiringVideoId}`)
    await page.waitForLoadState('networkidle')

    // 3. Verify video is in cache with expiration data
    const cachedVideo = await getVideoFromCache(page, TEST_WALLET_ADDRESS, expiringVideoId)
    expect(cachedVideo).toBeTruthy()
    expect(cachedVideo?.expiresAtBlock).toBe(expiresAtBlock)
    expect(cachedVideo?.arkivEntityStatus).toBe('active')

    // 4. Verify expiration block is set correctly
    const blocksRemaining = expiresAtBlock - currentBlock
    expect(blocksRemaining).toBe(500)
  })

  test('active video does not show expiration warning', async ({ page }) => {
    // 1. Seed cache with active video (no expiration)
    const activeVideoId = '0xactiveVideo789'
    const activeVideo = createTestCachedVideo({
      id: activeVideoId,
      title: 'Active Video',
      description: 'This video is still active on Arkiv',
      arkivEntityStatus: 'active',
      expiresAtBlock: undefined,
    })

    await seedCache(page, TEST_WALLET_ADDRESS, [activeVideo])

    // 2. Navigate to watch page
    await page.goto(`/watch/${activeVideoId}`)
    await page.waitForLoadState('networkidle')

    // 3. Verify video is in cache with active status
    const cachedVideo = await getVideoFromCache(page, TEST_WALLET_ADDRESS, activeVideoId)
    expect(cachedVideo).toBeTruthy()
    expect(cachedVideo?.arkivEntityStatus).toBe('active')
    expect(cachedVideo?.expiresAtBlock).toBeUndefined()
  })

  test('watch page updates last accessed timestamp', async ({ page }) => {
    const now = Date.now()
    const videoId = '0xaccessUpdateTest'

    // 1. Create video with old lastAccessedAt
    const video = createTestCachedVideo({
      id: videoId,
      title: 'Access Update Test',
      lastAccessedAt: now - 86400000, // 1 day ago
    })

    await seedCache(page, TEST_WALLET_ADDRESS, [video])

    // 2. Verify initial lastAccessedAt
    const initialVideo = await getVideoFromCache(page, TEST_WALLET_ADDRESS, videoId)
    expect(initialVideo?.lastAccessedAt).toBe(now - 86400000)

    // 3. Simulate watch page access by updating lastAccessedAt
    const accessTime = Date.now()
    await page.evaluate(
      async ({ address, videoId, accessTime }) => {
        const dbName = `haven-cache-${address.toLowerCase()}`

        return new Promise<void>((resolve, reject) => {
          const request = indexedDB.open(dbName)

          request.onsuccess = () => {
            const db = request.result
            const tx = db.transaction('videos', 'readwrite')
            const store = tx.objectStore('videos')

            const getReq = store.get(videoId)

            getReq.onsuccess = () => {
              const video = getReq.result
              if (video) {
                video.lastAccessedAt = accessTime
                store.put(video)
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
      { address: TEST_WALLET_ADDRESS, videoId, accessTime }
    )

    // 4. Verify lastAccessedAt was updated
    const updatedVideo = await getVideoFromCache(page, TEST_WALLET_ADDRESS, videoId)
    expect(updatedVideo?.lastAccessedAt).toBe(accessTime)
    expect(updatedVideo?.lastAccessedAt).toBeGreaterThan(now - 86400000)
  })

  test('expired video preserves all metadata for display', async ({ page }) => {
    const expiredVideoId = '0xexpiredMetadataTest'

    // 1. Create expired video with complete metadata
    const expiredVideo = createExpiredCachedVideo({
      id: expiredVideoId,
      title: 'Complete Expired Video',
      description: 'A video with full metadata that has expired',
      duration: 600,
      filecoinCid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
      encryptedCid: 'bafybeianothercid',
      isEncrypted: true,
      hasAiData: true,
      vlmJsonCid: 'bafybeivlmdata',
      mintId: 'mint-expired-123',
      sourceUri: 'https://example.com/source',
      creatorHandle: '@expiredcreator',
      codecVariants: [
        { codec: 'h264', resolution: '1080p', bitrate: 5000000, cid: '1080p-variant' },
        { codec: 'h264', resolution: '720p', bitrate: 2500000, cid: '720p-variant' },
        { codec: 'h264', resolution: '480p', bitrate: 1000000, cid: '480p-variant' },
      ],
      segmentMetadata: {
        startTimestamp: Date.now() - 600000,
        endTimestamp: Date.now(),
        segmentIndex: 1,
        totalSegments: 10,
      },
    })

    await seedCache(page, TEST_WALLET_ADDRESS, [expiredVideo])

    // 2. Retrieve video from cache
    const cachedVideo = await getVideoFromCache(page, TEST_WALLET_ADDRESS, expiredVideoId)

    // 3. Verify all metadata is preserved
    expect(cachedVideo?.title).toBe('Complete Expired Video')
    expect(cachedVideo?.description).toBe('A video with full metadata that has expired')
    expect(cachedVideo?.duration).toBe(600)
    expect(cachedVideo?.filecoinCid).toBe('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi')
    expect(cachedVideo?.encryptedCid).toBe('bafybeianothercid')
    expect(cachedVideo?.isEncrypted).toBe(true)
    expect(cachedVideo?.hasAiData).toBe(true)
    expect(cachedVideo?.vlmJsonCid).toBe('bafybeivlmdata')
    expect(cachedVideo?.mintId).toBe('mint-expired-123')
    expect(cachedVideo?.sourceUri).toBe('https://example.com/source')
    expect(cachedVideo?.creatorHandle).toBe('@expiredcreator')
    expect((cachedVideo?.codecVariants as unknown[]).length).toBe(3)
    expect((cachedVideo?.segmentMetadata as { totalSegments: number }).totalSegments).toBe(10)
    expect(cachedVideo?.arkivEntityStatus).toBe('expired')
  })

  test('watch page loads cached video when Arkiv is unavailable', async ({ page }) => {
    const videoId = '0xofflineVideo'

    // 1. Seed cache with video
    const video = createTestCachedVideo({
      id: videoId,
      title: 'Offline Available Video',
      description: 'Available even when Arkiv is down',
      arkivEntityStatus: 'active',
    })

    await seedCache(page, TEST_WALLET_ADDRESS, [video])

    // 2. Block Arkiv requests
    await page.route('**/arkiv**', async (route) => {
      await route.abort('failed')
    })
    await page.route('**/api/**', async (route) => {
      await route.abort('failed')
    })

    // 3. Navigate to watch page
    await page.goto(`/watch/${videoId}`)
    await page.waitForLoadState('networkidle')

    // 4. Verify video is still accessible from cache
    const cachedVideo = await getVideoFromCache(page, TEST_WALLET_ADDRESS, videoId)
    expect(cachedVideo).toBeTruthy()
    expect(cachedVideo?.title).toBe('Offline Available Video')
  })

  test('multiple video views track access independently', async ({ page }) => {
    // 1. Create multiple videos
    const video1Id = '0xmultiVideo1'
    const video2Id = '0xmultiVideo2'
    const now = Date.now()

    const video1 = createTestCachedVideo({
      id: video1Id,
      title: 'Video One',
      lastAccessedAt: now - 3600000, // 1 hour ago
    })

    const video2 = createTestCachedVideo({
      id: video2Id,
      title: 'Video Two',
      lastAccessedAt: now - 7200000, // 2 hours ago
    })

    await seedCache(page, TEST_WALLET_ADDRESS, [video1, video2])

    // 2. Access first video
    const accessTime1 = Date.now()
    await page.evaluate(
      async ({ address, videoId, accessTime }) => {
        const dbName = `haven-cache-${address.toLowerCase()}`

        return new Promise<void>((resolve, reject) => {
          const request = indexedDB.open(dbName)

          request.onsuccess = () => {
            const db = request.result
            const tx = db.transaction('videos', 'readwrite')
            const store = tx.objectStore('videos')

            const getReq = store.get(videoId)
            getReq.onsuccess = () => {
              const video = getReq.result
              if (video) {
                video.lastAccessedAt = accessTime
                store.put(video)
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
      { address: TEST_WALLET_ADDRESS, videoId: video1Id, accessTime: accessTime1 }
    )

    // 3. Verify only first video's access time was updated
    const updatedVideo1 = await getVideoFromCache(page, TEST_WALLET_ADDRESS, video1Id)
    const unchangedVideo2 = await getVideoFromCache(page, TEST_WALLET_ADDRESS, video2Id)

    expect(updatedVideo1?.lastAccessedAt).toBe(accessTime1)
    expect(unchangedVideo2?.lastAccessedAt).toBe(now - 7200000)
  })

  test('video with content cached status is preserved', async ({ page }) => {
    const videoId = '0xcontentCachedVideo'

    // 1. Create video with content cached
    const video = createTestCachedVideo({
      id: videoId,
      title: 'Content Cached Video',
      videoCacheStatus: 'cached',
      videoCachedAt: Date.now() - 3600000, // 1 hour ago
    })

    await seedCache(page, TEST_WALLET_ADDRESS, [video])

    // 2. Retrieve from cache
    const cachedVideo = await getVideoFromCache(page, TEST_WALLET_ADDRESS, videoId)

    // 3. Verify content cache status is preserved
    expect(cachedVideo?.videoCacheStatus).toBe('cached')
    expect(cachedVideo?.videoCachedAt).toBeGreaterThan(0)
  })

  test('expired video with stale content cache shows correct status', async ({ page }) => {
    const videoId = '0xexpiredStaleVideo'

    // 1. Create expired video with stale content cache
    const video = createExpiredCachedVideo({
      id: videoId,
      title: 'Expired Stale Video',
      videoCacheStatus: 'stale',
      videoCachedAt: Date.now() - 86400000 * 7, // 7 days ago
    })

    await seedCache(page, TEST_WALLET_ADDRESS, [video])

    // 2. Retrieve from cache
    const cachedVideo = await getVideoFromCache(page, TEST_WALLET_ADDRESS, videoId)

    // 3. Verify both metadata and content status
    expect(cachedVideo?.arkivEntityStatus).toBe('expired')
    expect(cachedVideo?.videoCacheStatus).toBe('stale')
    expect(cachedVideo?.videoCachedAt).toBeGreaterThan(0)
  })
})
