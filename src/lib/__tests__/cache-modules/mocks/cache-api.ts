/**
 * Mock Cache API for unit testing
 * 
 * Provides an in-memory implementation of the Cache API for testing
 * without browser dependencies.
 */

/**
 * Mock Cache implementation using an in-memory Map.
 * Simulates the browser Cache API behavior.
 */
export class MockCache {
  private store = new Map<string, Response>()

  /**
   * Match a request URL against the cache.
   * Returns the cached Response or undefined.
   */
  async match(request: Request | string): Promise<Response | undefined> {
    const url = typeof request === 'string' ? request : request.url
    // Normalize URL by removing origin for consistent matching
    const normalizedUrl = url.replace(/^https?:\/\/[^/]+/, '')
    
    for (const [key, response] of this.store) {
      const normalizedKey = key.replace(/^https?:\/\/[^/]+/, '')
      if (normalizedKey === normalizedUrl || key === url) {
        // Return a clone to match browser behavior
        return response.clone()
      }
    }
    return undefined
  }

  /**
   * Put a request/response pair into the cache.
   */
  async put(request: Request | string, response: Response): Promise<void> {
    const url = typeof request === 'string' ? request : request.url
    // Clone the response to store it (response bodies can only be read once)
    this.store.set(url, response.clone())
  }

  /**
   * Delete a cached entry by URL.
   */
  async delete(request: Request | string): Promise<boolean> {
    const url = typeof request === 'string' ? request : request.url
    const normalizedUrl = url.replace(/^https?:\/\/[^/]+/, '')
    
    for (const [key] of this.store) {
      const normalizedKey = key.replace(/^https?:\/\/[^/]+/, '')
      if (normalizedKey === normalizedUrl || key === url) {
        return this.store.delete(key)
      }
    }
    return false
  }

  /**
   * Get all cached request keys.
   */
  async keys(): Promise<Request[]> {
    return Array.from(this.store.keys()).map(url => new Request(url))
  }

  /**
   * Clear all cached entries.
   */
  clear(): void {
    this.store.clear()
  }

  /**
   * Get the number of cached entries.
   */
  get size(): number {
    return this.store.size
  }
}

/**
 * Mock CacheStorage implementation.
 * Simulates the browser caches global object.
 */
export class MockCacheStorage {
  private caches = new Map<string, MockCache>()

  /**
   * Open a named cache, creating it if it doesn't exist.
   */
  async open(name: string): Promise<MockCache> {
    if (!this.caches.has(name)) {
      this.caches.set(name, new MockCache())
    }
    return this.caches.get(name)!
  }

  /**
   * Delete a named cache.
   */
  async delete(name: string): Promise<boolean> {
    return this.caches.delete(name)
  }

  /**
   * Get all cache names.
   */
  async keys(): Promise<string[]> {
    return Array.from(this.caches.keys())
  }

  /**
   * Check if a cache exists.
   */
  has(name: string): boolean {
    return this.caches.has(name)
  }

  /**
   * Get a specific cache without creating it.
   */
  get(name: string): MockCache | undefined {
    return this.caches.get(name)
  }

  /**
   * Clear all caches.
   */
  clearAll(): void {
    for (const cache of this.caches.values()) {
      cache.clear()
    }
    this.caches.clear()
  }
}

/**
 * Setup the global caches mock.
 * Call this in test setup to mock the browser Cache API.
 */
export function setupCacheMock(): MockCacheStorage {
  const mockStorage = new MockCacheStorage()
  
  // Mock global caches object
  Object.defineProperty(global, 'caches', {
    value: mockStorage,
    writable: true,
    configurable: true,
  })

  // Mock window to indicate browser environment
  if (typeof global.window === 'undefined') {
    Object.defineProperty(global, 'window', {
      value: { location: { origin: 'https://test.example.com' } },
      writable: true,
      configurable: true,
    })
  }

  // Mock self for service worker compatibility
  if (typeof global.self === 'undefined') {
    Object.defineProperty(global, 'self', {
      value: { location: { origin: 'https://test.example.com' } },
      writable: true,
      configurable: true,
    })
  }

  // Mock navigator.storage.estimate()
  Object.defineProperty(global, 'navigator', {
    value: {
      storage: {
        estimate: jest.fn().mockResolvedValue({ usage: 100, quota: 1000 }),
      },
    },
    writable: true,
    configurable: true,
  })

  return mockStorage
}

/**
 * Reset the cache mock state.
 * Call this in beforeEach to ensure clean state between tests.
 */
export function resetCacheMock(): MockCacheStorage {
  return setupCacheMock()
}

/**
 * Teardown the cache mock.
 * Call this in afterAll to clean up.
 */
export function teardownCacheMock(): void {
  // Clean up global mocks
  if ((global as any).caches instanceof MockCacheStorage) {
    ;(global as any).caches.clearAll()
  }
}
