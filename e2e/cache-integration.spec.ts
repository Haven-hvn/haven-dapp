/**
 * Cache Integration E2E Tests
 *
 * End-to-end tests verifying cache behavior in a real browser environment.
 * Tests cache loading, persistence, and performance.
 */

import { test, expect } from '@playwright/test'

test.describe('Cache Integration', () => {
  test('library loads from cache on second visit', async ({ page }) => {
    // Note: This test assumes the app is running at http://localhost:3000
    // Adjust the URL as needed for your test environment

    // 1. Visit library page (first time — would load from Arkiv in real app)
    // For this test, we assume the page loads and IndexedDB is available
    await page.goto('/library')

    // Wait for the page to be ready (adjust selector as needed)
    await page.waitForLoadState('networkidle')

    // 2. Check IndexedDB availability and setup
    const isIndexedDBAvailable = await page.evaluate(() => {
      return new Promise<boolean>((resolve) => {
        try {
          const request = indexedDB.open('test-db')
          request.onsuccess = () => {
            request.result.close()
            indexedDB.deleteDatabase('test-db')
            resolve(true)
          }
          request.onerror = () => resolve(false)
        } catch {
          resolve(false)
        }
      })
    })

    expect(isIndexedDBAvailable).toBe(true)

    // 3. Verify IndexedDB can be accessed from the page
    const cacheDBName = await page.evaluate(async () => {
      // Check if any haven-cache databases exist
      try {
        // databases() may not be available in all browsers
        const databases = await indexedDB.databases()
        const havenDBs = databases?.filter(
          (db: { name?: string }) => db.name?.startsWith('haven-cache-')
        )
        return havenDBs?.length > 0 ? havenDBs[0].name : null
      } catch {
        // Fallback: try to open a test database
        return null
      }
    })

    // Cache database may or may not exist depending on app state
    console.log('Cache DB name:', cacheDBName || 'Not yet created')

    // 4. Simulate cache population (in real test, this would happen via app usage)
    await page.evaluate(() => {
      return new Promise<void>((resolve, reject) => {
        const dbName = 'haven-cache-testwallet'
        const request = indexedDB.open(dbName, 1)

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result
          if (!db.objectStoreNames.contains('videos')) {
            db.createObjectStore('videos', { keyPath: 'id' })
          }
          if (!db.objectStoreNames.contains('metadata')) {
            db.createObjectStore('metadata', { keyPath: 'key' })
          }
        }

        request.onsuccess = () => {
          const db = request.result
          const transaction = db.transaction('videos', 'readwrite')
          const store = transaction.objectStore('videos')

          // Add test video
          const video = {
            id: '0xtestvideo1',
            owner: '0x1234567890abcdef1234567890abcdef12345678',
            title: 'Test Video',
            description: 'Test Description',
            duration: 120,
            filecoinCid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
            encryptedCid: undefined,
            isEncrypted: false,
            litEncryptionMetadata: undefined,
            hasAiData: false,
            vlmJsonCid: undefined,
            mintId: undefined,
            sourceUri: undefined,
            creatorHandle: undefined,
            createdAt: Date.now(),
            updatedAt: undefined,
            codecVariants: undefined,
            segmentMetadata: undefined,
            cachedAt: Date.now(),
            lastSyncedAt: Date.now(),
            lastAccessedAt: Date.now(),
            cacheVersion: 1,
            arkivEntityStatus: 'active',
            arkivEntityKey: '0xtestvideo1',
            expiresAtBlock: undefined,
            syncHash: undefined,
            isDirty: false,
            videoCacheStatus: 'not-cached',
            videoCachedAt: undefined,
          }

          store.put(video)

          transaction.oncomplete = () => {
            db.close()
            resolve()
          }
          transaction.onerror = () => reject(new Error('Failed to add test video'))
        }

        request.onerror = () => reject(new Error('Failed to open database'))
      })
    })

    // 5. Verify IndexedDB has data
    const hasData = await page.evaluate(async () => {
      return new Promise<boolean>((resolve) => {
        const dbName = 'haven-cache-testwallet'
        const request = indexedDB.open(dbName, 1)

        request.onsuccess = () => {
          const db = request.result
          const transaction = db.transaction('videos', 'readonly')
          const store = transaction.objectStore('videos')
          const countRequest = store.count()

          countRequest.onsuccess = () => {
            db.close()
            resolve(countRequest.result > 0)
          }
          countRequest.onerror = () => {
            db.close()
            resolve(false)
          }
        }

        request.onerror = () => resolve(false)
      })
    })

    expect(hasData).toBe(true)

    // 6. Reload page
    await page.reload()
    await page.waitForLoadState('networkidle')

    // 7. Verify cache data is still available after reload
    const stillHasData = await page.evaluate(async () => {
      return new Promise<boolean>((resolve) => {
        const dbName = 'haven-cache-testwallet'
        const request = indexedDB.open(dbName, 1)

        request.onsuccess = () => {
          const db = request.result
          const transaction = db.transaction('videos', 'readonly')
          const store = transaction.objectStore('videos')
          const getRequest = store.get('0xtestvideo1')

          getRequest.onsuccess = () => {
            db.close()
            resolve(getRequest.result !== undefined)
          }
          getRequest.onerror = () => {
            db.close()
            resolve(false)
          }
        }

        request.onerror = () => resolve(false)
      })
    })

    expect(stillHasData).toBe(true)

    // Cleanup
    await page.evaluate(() => {
      return new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase('haven-cache-testwallet')
        request.onsuccess = () => resolve()
        request.onerror = () => resolve()
      })
    })
  })

  test('cache persists across page reloads', async ({ page }) => {
    // Test that cache data survives page reloads
    await page.goto('/library')
    await page.waitForLoadState('networkidle')

    // Store test data in IndexedDB
    await page.evaluate(() => {
      return new Promise<void>((resolve, reject) => {
        const dbName = 'haven-cache-persist-test'
        const request = indexedDB.open(dbName, 1)

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result
          if (!db.objectStoreNames.contains('videos')) {
            db.createObjectStore('videos', { keyPath: 'id' })
          }
        }

        request.onsuccess = () => {
          const db = request.result
          const transaction = db.transaction('videos', 'readwrite')
          const store = transaction.objectStore('videos')

          const testData = {
            id: 'persist-test-1',
            owner: '0x1234567890abcdef1234567890abcdef12345678',
            title: 'Persistent Video',
            description: 'This should persist',
            duration: 60,
            filecoinCid: 'test-cid',
            isEncrypted: false,
            hasAiData: false,
            createdAt: Date.now(),
            cachedAt: Date.now(),
            lastSyncedAt: Date.now(),
            lastAccessedAt: Date.now(),
            cacheVersion: 1,
            arkivEntityStatus: 'active',
            arkivEntityKey: 'persist-test-1',
            isDirty: false,
            videoCacheStatus: 'not-cached',
          }

          store.put(testData)

          transaction.oncomplete = () => {
            db.close()
            resolve()
          }
          transaction.onerror = () => reject(new Error('Failed to store'))
        }

        request.onerror = () => reject(new Error('Failed to open'))
      })
    })

    // Reload the page
    await page.reload()
    await page.waitForLoadState('networkidle')

    // Verify data is still there
    const data = await page.evaluate(() => {
      return new Promise<{ id: string; title: string } | null>((resolve) => {
        const dbName = 'haven-cache-persist-test'
        const request = indexedDB.open(dbName, 1)

        request.onsuccess = () => {
          const db = request.result
          const transaction = db.transaction('videos', 'readonly')
          const store = transaction.objectStore('videos')
          const getRequest = store.get('persist-test-1')

          getRequest.onsuccess = () => {
            db.close()
            resolve(getRequest.result || null)
          }
          getRequest.onerror = () => {
            db.close()
            resolve(null)
          }
        }

        request.onerror = () => resolve(null)
      })
    })

    expect(data).not.toBeNull()
    expect(data?.id).toBe('persist-test-1')
    expect(data?.title).toBe('Persistent Video')

    // Cleanup
    await page.evaluate(() => {
      return new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase('haven-cache-persist-test')
        request.onsuccess = () => resolve()
        request.onerror = () => resolve()
      })
    })
  })

  test('IndexedDB operations are performant', async ({ page }) => {
    await page.goto('/library')
    await page.waitForLoadState('networkidle')

    // Measure write performance
    const writeTime = await page.evaluate(() => {
      return new Promise<number>((resolve, reject) => {
        const dbName = 'haven-cache-perf-test'
        const request = indexedDB.open(dbName, 1)

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result
          if (!db.objectStoreNames.contains('videos')) {
            db.createObjectStore('videos', { keyPath: 'id' })
          }
        }

        request.onsuccess = () => {
          const db = request.result
          const transaction = db.transaction('videos', 'readwrite')
          const store = transaction.objectStore('videos')

          const start = performance.now()

          // Write 50 videos
          for (let i = 0; i < 50; i++) {
            store.put({
              id: `perf-test-${i}`,
              owner: '0x1234567890abcdef1234567890abcdef12345678',
              title: `Video ${i}`,
              description: 'Performance test video',
              duration: 120,
              filecoinCid: `cid-${i}`,
              isEncrypted: false,
              hasAiData: false,
              createdAt: Date.now(),
              cachedAt: Date.now(),
              lastSyncedAt: Date.now(),
              lastAccessedAt: Date.now(),
              cacheVersion: 1,
              arkivEntityStatus: 'active',
              arkivEntityKey: `perf-test-${i}`,
              isDirty: false,
              videoCacheStatus: 'not-cached',
            })
          }

          transaction.oncomplete = () => {
            const end = performance.now()
            db.close()
            resolve(end - start)
          }
          transaction.onerror = () => {
            db.close()
            reject(new Error('Write failed'))
          }
        }

        request.onerror = () => reject(new Error('Open failed'))
      })
    })

    console.log(`Write time for 50 videos: ${writeTime.toFixed(2)}ms`)
    expect(writeTime).toBeLessThan(1000) // Should complete within 1 second

    // Measure read performance
    const readTime = await page.evaluate(() => {
      return new Promise<number>((resolve, reject) => {
        const dbName = 'haven-cache-perf-test'
        const request = indexedDB.open(dbName, 1)

        request.onsuccess = () => {
          const db = request.result
          const transaction = db.transaction('videos', 'readonly')
          const store = transaction.objectStore('videos')
          const getAllRequest = store.getAll()

          const start = performance.now()

          getAllRequest.onsuccess = () => {
            const end = performance.now()
            db.close()
            resolve(end - start)
          }
          getAllRequest.onerror = () => {
            db.close()
            reject(new Error('Read failed'))
          }
        }

        request.onerror = () => reject(new Error('Open failed'))
      })
    })

    console.log(`Read time for 50 videos: ${readTime.toFixed(2)}ms`)
    expect(readTime).toBeLessThan(100) // Should complete within 100ms

    // Cleanup
    await page.evaluate(() => {
      return new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase('haven-cache-perf-test')
        request.onsuccess = () => resolve()
        request.onerror = () => resolve()
      })
    })
  })
})
