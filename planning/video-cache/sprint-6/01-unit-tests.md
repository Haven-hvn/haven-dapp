# Task 6.1: Unit Tests for Cache Modules

## Objective

Write comprehensive unit tests for all new library modules introduced in the video caching system. Tests should cover happy paths, error cases, and edge cases.

## Modules to Test

### 1. `video-cache.ts` — Cache API Wrapper

```typescript
describe('video-cache', () => {
  describe('putVideo', () => {
    it('stores video data with correct headers')
    it('stores Uint8Array input')
    it('stores ArrayBuffer input')
    it('stores Blob input')
    it('sets X-Haven-Video-Id header')
    it('sets X-Haven-Cached-At header with ISO timestamp')
    it('sets X-Haven-Size header matching data size')
    it('sets Content-Type from mimeType parameter')
    it('sets Accept-Ranges: bytes header')
    it('sets X-Haven-TTL when ttl is provided')
  })
  
  describe('getVideo', () => {
    it('returns response and metadata for cached video')
    it('returns null for uncached video')
    it('parses metadata from response headers')
  })
  
  describe('hasVideo', () => {
    it('returns true for cached video')
    it('returns false for uncached video')
    it('does not consume the response body')
  })
  
  describe('deleteVideo', () => {
    it('removes video from cache')
    it('returns true on successful deletion')
    it('returns false when video not in cache')
  })
  
  describe('listCachedVideos', () => {
    it('returns empty array when no videos cached')
    it('returns all cached video entries')
    it('extracts metadata from each entry')
  })
  
  describe('clearAllVideos', () => {
    it('removes all cached videos')
    it('cache is empty after clearing')
  })
})
```

### 2. `opfs.ts` — OPFS Staging

```typescript
describe('opfs', () => {
  describe('isOpfsAvailable', () => {
    it('returns true when OPFS is supported')
    it('returns false in SSR context')
  })
  
  describe('writeToStaging', () => {
    it('writes stream data to OPFS file')
    it('reports progress via callback')
    it('returns total bytes written')
  })
  
  describe('readFromStaging', () => {
    it('reads staged data back as Uint8Array')
    it('throws when file does not exist')
  })
  
  describe('deleteStaging', () => {
    it('removes staging file')
    it('does not throw when file does not exist')
  })
  
  describe('clearAllStaging', () => {
    it('removes all staging files')
  })
})
```

### 3. `lit-session-cache.ts` — Session Caching

```typescript
describe('lit-session-cache', () => {
  describe('getCachedAuthContext', () => {
    it('returns null when no session cached')
    it('returns cached session when valid')
    it('returns null when session expired')
    it('returns null when within safety margin of expiry')
    it('normalizes address to lowercase')
  })
  
  describe('setCachedAuthContext', () => {
    it('stores auth context for address')
    it('normalizes address to lowercase')
    it('sets correct expiration time')
  })
  
  describe('clearAuthContext', () => {
    it('clears specific address session')
    it('clears all sessions when no address provided')
  })
})
```

### 4. `aes-key-cache.ts` — Key Caching

```typescript
describe('aes-key-cache', () => {
  describe('getCachedKey', () => {
    it('returns null when no key cached')
    it('returns key copy when cached')
    it('returns null when key expired')
    it('returned key is a copy, not a reference')
  })
  
  describe('setCachedKey', () => {
    it('stores key copy for video ID')
    it('overwrites existing key for same video')
    it('zero-fills old key when overwriting')
  })
  
  describe('clearKey', () => {
    it('zero-fills key before removing')
    it('removes key from cache')
    it('does not throw for non-existent key')
  })
  
  describe('clearAllKeys', () => {
    it('zero-fills and removes all keys')
  })
})
```

### 5. `cache-expiration.ts` — TTL & Cleanup

```typescript
describe('cache-expiration', () => {
  describe('isExpired', () => {
    it('returns false for fresh entry')
    it('returns true for expired entry')
    it('uses default TTL when none specified')
  })
  
  describe('runCleanupSweep', () => {
    it('removes expired entries')
    it('keeps non-expired entries')
    it('returns count of removed entries')
  })
  
  describe('enforceMaxVideos', () => {
    it('does nothing when under limit')
    it('removes oldest entries when over limit')
  })
})
```

### 6. `memory-detect.ts` — Memory Detection

```typescript
describe('memory-detect', () => {
  describe('getDecryptionStrategy', () => {
    it('returns in-memory for small files')
    it('returns opfs-staged for large files on constrained devices')
    it('returns too-large for files exceeding all strategies')
    it('includes warning message when appropriate')
  })
})
```

### 7. `security-cleanup.ts` — Security Cleanup

```typescript
describe('security-cleanup', () => {
  describe('onWalletDisconnect', () => {
    it('clears Lit session for address')
    it('clears all AES keys')
    it('clears staging files')
  })
  
  describe('onAccountChange', () => {
    it('clears old account session')
    it('clears AES keys')
  })
  
  describe('onSecurityClear', () => {
    it('clears all sessions, keys, videos, and staging')
    it('returns status for each operation')
  })
})
```

## Test Setup

### Mocking Cache API

```typescript
// test/mocks/cache-api.ts
class MockCache {
  private store = new Map<string, Response>()
  
  async match(url: string) { return this.store.get(url) }
  async put(url: string, response: Response) { this.store.set(url, response) }
  async delete(url: string) { return this.store.delete(url) }
  async keys() { return Array.from(this.store.keys()).map(url => new Request(url)) }
}

class MockCacheStorage {
  private caches = new Map<string, MockCache>()
  
  async open(name: string) {
    if (!this.caches.has(name)) this.caches.set(name, new MockCache())
    return this.caches.get(name)!
  }
  async delete(name: string) { return this.caches.delete(name) }
  async keys() { return Array.from(this.caches.keys()) }
}

// In test setup:
global.caches = new MockCacheStorage() as any
```

## Acceptance Criteria

- [ ] All `video-cache.ts` functions have unit tests
- [ ] All `opfs.ts` functions have unit tests (with OPFS mock)
- [ ] All `lit-session-cache.ts` functions have unit tests
- [ ] All `aes-key-cache.ts` functions have unit tests
- [ ] All `cache-expiration.ts` functions have unit tests
- [ ] All `memory-detect.ts` functions have unit tests
- [ ] All `security-cleanup.ts` functions have unit tests
- [ ] Tests cover happy paths, error cases, and edge cases
- [ ] Cache API is properly mocked for testing
- [ ] Tests run in CI without browser dependencies
- [ ] Code coverage > 80% for all new modules

## Dependencies

- All Sprint 1-5 modules (this tests them)

## Estimated Effort

Large (8-10 hours)