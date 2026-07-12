/**
 * IndexedDB Database Operations
 * 
 * Low-level CRUD operations for the Haven cache system.
 * Each wallet gets its own IndexedDB database for isolation.
 */

import type { CachedVideo, CacheMetadataEntry, CacheStats } from '../../types/cache'
import { CURRENT_CACHE_VERSION } from '../../types/cache'
import {
  getStoredSchemaVersion,
  runMigrations,
  runStructuralMigrations,
  getFailedMigration,
} from './migrations'

const DB_PREFIX = 'haven-cache-'
const DB_VERSION = CURRENT_CACHE_VERSION

// Track open database connections
const openDBConnections = new Map<string, IDBDatabase>()

/**
 * Get the database name for a wallet address
 */
function getDBName(walletAddress: string): string {
  return `${DB_PREFIX}${walletAddress.toLowerCase()}`
}

/**
 * Open the IndexedDB database for a wallet
 */
function openDB(walletAddress: string): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(getDBName(walletAddress), DB_VERSION)

    request.onerror = () => {
      reject(new Error(`Failed to open database for wallet ${walletAddress}`))
    }

    request.onsuccess = () => {
      const db = request.result
      resolve(db)
    }

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      const oldVersion = event.oldVersion
      const newVersion = event.newVersion || CURRENT_CACHE_VERSION
      const transaction = (event.target as IDBOpenDBRequest).transaction!

      // Create videos object store if it doesn't exist (v1 schema)
      if (oldVersion < 1) {
        const videoStore = db.createObjectStore('videos', { keyPath: 'id' })
        videoStore.createIndex('by-owner', 'owner', { unique: false })
        videoStore.createIndex('by-cached-at', 'cachedAt', { unique: false })
        videoStore.createIndex('by-last-synced', 'lastSyncedAt', { unique: false })
        videoStore.createIndex('by-status', 'arkivEntityStatus', { unique: false })
      }

      // Create metadata object store if it doesn't exist
      if (oldVersion < 1) {
        db.createObjectStore('metadata', { keyPath: 'key' })
      }

      // Run structural migrations for version upgrades
      if (oldVersion > 0 && oldVersion < newVersion) {
        runStructuralMigrations(db, transaction, oldVersion, newVersion)
      }
    }
  }).then(async (db: IDBDatabase) => {
    // Run data migrations after DB is opened
    // Check for failed migrations from previous attempts
    const failedMigration = await getFailedMigration(db)
    if (failedMigration) {
      console.warn('[CacheDB] Retrying failed migration:', failedMigration.value)
    }

    // Get stored schema version and run pending migrations
    const storedVersion = await getStoredSchemaVersion(db)
    if (storedVersion < CURRENT_CACHE_VERSION) {
      await runMigrations(db, storedVersion, CURRENT_CACHE_VERSION)
    }

    return db
  })
}

/**
 * Get all cached videos for a wallet
 */
export async function getAllCachedVideos(walletAddress: string): Promise<CachedVideo[]> {
  const db = await openDB(walletAddress)
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('videos', 'readonly')
    const store = transaction.objectStore('videos')
    const request = store.getAll()

    request.onsuccess = () => {
      db.close()
      resolve(request.result as CachedVideo[])
    }

    request.onerror = () => {
      db.close()
      reject(new Error('Failed to get all cached videos'))
    }
  })
}

/**
 * Get a single cached video by ID
 */
export async function getCachedVideo(
  walletAddress: string, 
  videoId: string
): Promise<CachedVideo | null> {
  const db = await openDB(walletAddress)
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('videos', 'readonly')
    const store = transaction.objectStore('videos')
    const request = store.get(videoId)

    request.onsuccess = () => {
      db.close()
      const result = request.result as CachedVideo | undefined
      resolve(result ?? null)
    }

    request.onerror = () => {
      db.close()
      reject(new Error(`Failed to get cached video ${videoId}`))
    }
  })
}

/**
 * Store a single cached video
 */
export async function putCachedVideo(
  walletAddress: string, 
  cachedVideo: CachedVideo
): Promise<void> {
  const db = await openDB(walletAddress)
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('videos', 'readwrite')
    const store = transaction.objectStore('videos')
    const request = store.put(cachedVideo)

    request.onsuccess = () => {
      db.close()
      resolve()
    }

    request.onerror = () => {
      db.close()
      reject(new Error(`Failed to store cached video ${cachedVideo.id}`))
    }
  })
}

/**
 * Store multiple cached videos in a single transaction
 */
export async function putCachedVideos(
  walletAddress: string, 
  cachedVideos: CachedVideo[]
): Promise<void> {
  if (cachedVideos.length === 0) {
    return
  }

  const db = await openDB(walletAddress)
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('videos', 'readwrite')
    const store = transaction.objectStore('videos')

    let completed = 0
    let hasError = false

    for (const video of cachedVideos) {
      const request = store.put(video)

      request.onsuccess = () => {
        completed++
        if (completed === cachedVideos.length && !hasError) {
          db.close()
          resolve()
        }
      }

      request.onerror = () => {
        hasError = true
        reject(new Error(`Failed to store cached video ${video.id}`))
      }
    }

    transaction.onerror = () => {
      db.close()
      if (!hasError) {
        reject(new Error('Transaction failed while storing cached videos'))
      }
    }

    transaction.oncomplete = () => {
      db.close()
      resolve()
    }
  })
}

/**
 * Delete a cached video by ID
 */
export async function deleteCachedVideo(
  walletAddress: string, 
  videoId: string
): Promise<void> {
  const db = await openDB(walletAddress)
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('videos', 'readwrite')
    const store = transaction.objectStore('videos')
    const request = store.delete(videoId)

    request.onsuccess = () => {
      db.close()
      resolve()
    }

    request.onerror = () => {
      db.close()
      reject(new Error(`Failed to delete cached video ${videoId}`))
    }
  })
}

/**
 * Delete multiple cached videos in a single transaction
 */
export async function deleteCachedVideos(
  walletAddress: string, 
  videoIds: string[]
): Promise<void> {
  if (videoIds.length === 0) {
    return
  }

  const db = await openDB(walletAddress)
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('videos', 'readwrite')
    const store = transaction.objectStore('videos')

    let completed = 0
    let hasError = false

    for (const videoId of videoIds) {
      const request = store.delete(videoId)

      request.onsuccess = () => {
        completed++
        if (completed === videoIds.length && !hasError) {
          db.close()
          resolve()
        }
      }

      request.onerror = () => {
        hasError = true
        reject(new Error(`Failed to delete cached video ${videoId}`))
      }
    }

    transaction.oncomplete = () => {
      db.close()
      resolve()
    }
  })
}

/**
 * Clear all cached videos for a wallet
 */
export async function clearCachedVideos(walletAddress: string): Promise<void> {
  const db = await openDB(walletAddress)
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('videos', 'readwrite')
    const store = transaction.objectStore('videos')
    const request = store.clear()

    request.onsuccess = () => {
      db.close()
      resolve()
    }

    request.onerror = () => {
      db.close()
      reject(new Error('Failed to clear cached videos'))
    }
  })
}

/**
 * Get a metadata entry by key
 */
export async function getCacheMetadata(
  walletAddress: string, 
  key: string
): Promise<CacheMetadataEntry | null> {
  const db = await openDB(walletAddress)
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('metadata', 'readonly')
    const store = transaction.objectStore('metadata')
    const request = store.get(key)

    request.onsuccess = () => {
      db.close()
      const result = request.result as CacheMetadataEntry | undefined
      resolve(result ?? null)
    }

    request.onerror = () => {
      db.close()
      reject(new Error(`Failed to get metadata ${key}`))
    }
  })
}

/**
 * Set a metadata entry
 */
export async function setCacheMetadata(
  walletAddress: string, 
  entry: CacheMetadataEntry
): Promise<void> {
  const db = await openDB(walletAddress)
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('metadata', 'readwrite')
    const store = transaction.objectStore('metadata')
    const request = store.put(entry)

    request.onsuccess = () => {
      db.close()
      resolve()
    }

    request.onerror = () => {
      db.close()
      reject(new Error(`Failed to set metadata ${entry.key}`))
    }
  })
}

/**
 * Get all metadata entries
 */
export async function getAllCacheMetadata(walletAddress: string): Promise<CacheMetadataEntry[]> {
  const db = await openDB(walletAddress)
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('metadata', 'readonly')
    const store = transaction.objectStore('metadata')
    const request = store.getAll()

    request.onsuccess = () => {
      db.close()
      resolve(request.result as CacheMetadataEntry[])
    }

    request.onerror = () => {
      db.close()
      reject(new Error('Failed to get all metadata entries'))
    }
  })
}

/**
 * Get all cached videos sorted by lastAccessedAt (oldest first)
 * Used for LRU eviction
 */
export async function getVideosByLastAccessed(
  walletAddress: string,
  limit?: number
): Promise<CachedVideo[]> {
  const allVideos = await getAllCachedVideos(walletAddress)
  
  const sorted = allVideos.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt)
  
  if (limit) {
    return sorted.slice(0, limit)
  }
  
  return sorted
}

/**
 * Get cache statistics for a wallet
 */
export async function getCacheStats(walletAddress: string): Promise<CacheStats> {
  const allVideos = await getAllCachedVideos(walletAddress)
  const lastSyncEntry = await getCacheMetadata(walletAddress, 'lastFullSync')
  
  const activeVideos = allVideos.filter(v => v.arkivEntityStatus === 'active').length
  const expiredVideos = allVideos.filter(v => v.arkivEntityStatus === 'expired').length
  
  // Estimate size (rough approximation based on JSON stringification)
  const cacheSize = allVideos.reduce((total, video) => {
    return total + JSON.stringify(video).length * 2 // *2 for UTF-16
  }, 0)
  
  const cachedAts = allVideos.map(v => v.cachedAt).filter(Boolean)
  
  return {
    totalVideos: allVideos.length,
    activeVideos,
    expiredVideos,
    cacheSize,
    lastFullSync: lastSyncEntry?.value ? Number(lastSyncEntry.value) : null,
    oldestEntry: cachedAts.length > 0 ? Math.min(...cachedAts) : null,
    newestEntry: cachedAts.length > 0 ? Math.max(...cachedAts) : null,
  }
}

/**
 * Delete the entire database for a wallet
 */
export async function deleteDatabase(walletAddress: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(getDBName(walletAddress))
    
    request.onsuccess = () => {
      resolve()
    }
    
    request.onerror = () => {
      reject(new Error(`Failed to delete database for wallet ${walletAddress}`))
    }
    
    request.onblocked = () => {
      reject(new Error(`Database deletion blocked for wallet ${walletAddress}`))
    }
  })
}

// ── Database Connection Management ────────────────────────────────────────────

/**
 * Get or open the IndexedDB database for a wallet.
 * Returns a cached connection if one exists.
 * @param walletAddress - The wallet address
 * @returns The IDBDatabase instance
 */
export async function getCacheDB(walletAddress: string): Promise<IDBDatabase> {
  const key = walletAddress.toLowerCase()
  
  // Return existing connection if open
  const existing = openDBConnections.get(key)
  if (existing) {
    return existing
  }
  
  // Open new connection
  const db = await openDB(walletAddress)
  openDBConnections.set(key, db)
  
  // Handle unexpected closes
  db.onclose = () => {
    openDBConnections.delete(key)
  }
  
  return db
}

/**
 * Close the database connection for a wallet.
 * @param walletAddress - The wallet address
 */
export function closeCacheDB(walletAddress: string): void {
  const key = walletAddress.toLowerCase()
  const db = openDBConnections.get(key)
  
  if (db) {
    db.close()
    openDBConnections.delete(key)
    console.info(`[CacheDB] Closed database for ${key.slice(0, 8)}...`)
  }
}

/**
 * Close all open database connections.
 * Useful for app unmount or emergency cleanup.
 */
export function closeAllCacheDBs(): void {
  for (const [key, db] of openDBConnections) {
    db.close()
    console.info(`[CacheDB] Closed database for ${key.slice(0, 8)}...`)
  }
  openDBConnections.clear()
}
