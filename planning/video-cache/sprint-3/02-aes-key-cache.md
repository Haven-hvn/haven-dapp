# Task 3.2: Per-Video AES Key Cache

## Objective

Cache decrypted AES keys in memory so that if a video needs to be re-decrypted (e.g., cache eviction, corruption), the expensive Lit Protocol BLS-IBE key decryption can be skipped entirely. This eliminates the need for Lit node communication on re-decryption.

## Background

### Current Key Decryption Cost

The AES key decryption via Lit Protocol is the most expensive step in the pipeline:

1. Authenticate with Lit nodes (SIWE — addressed by Task 3.1)
2. Send encrypted key + access control conditions to Lit nodes
3. Lit nodes verify access, perform BLS-IBE decryption
4. Return decrypted AES key

Steps 2-4 involve network round-trips to multiple Lit nodes and take 2-5 seconds. If we cache the resulting AES key, we can skip all of this on subsequent decryptions of the same video.

### Security Consideration

AES keys are sensitive cryptographic material. Caching them in memory is acceptable because:

- They're already in memory during decryption today
- The cache is in-memory only (not persisted to disk)
- Keys are cleared on wallet disconnect
- Keys are cleared on page unload
- The browser's same-origin policy protects against cross-site access

We should NOT persist AES keys to `localStorage`, `sessionStorage`, or IndexedDB.

## Requirements

### Key Cache (`src/lib/aes-key-cache.ts`)

1. **`getCachedKey(videoId)`** — Get cached AES key for a video
   - Return `{ key: Uint8Array, iv: Uint8Array }` if cached
   - Return `null` if not cached

2. **`setCachedKey(videoId, key, iv)`** — Cache an AES key
   - Store a **copy** of the key (not a reference to the original)
   - Associate with the video ID
   - Set a TTL (default: same as Lit session, 1 hour)

3. **`clearKey(videoId)`** — Remove a specific key from cache
   - Zero-fill the key before removing (security)

4. **`clearAllKeys()`** — Remove all cached keys
   - Zero-fill all keys before removing
   - Called on wallet disconnect and page unload

5. **`getKeyStats()`** — Return cache statistics
   - Number of cached keys
   - Total memory used (approximate)

### Integration with `decryptAesKey`

```typescript
// In lit-decrypt.ts

import { getCachedKey, setCachedKey } from './aes-key-cache'

export async function decryptAesKey(options: DecryptAesKeyOptions): Promise<DecryptKeyResult> {
  const videoId = options.metadata.videoId // or derive from metadata
  
  // Check key cache first
  const cachedKey = getCachedKey(videoId)
  if (cachedKey) {
    onProgress?.('Using cached decryption key')
    return { aesKey: cachedKey.key }
  }
  
  // Cache miss — full Lit Protocol decryption
  // ... existing code ...
  
  const aesKey = /* decrypted key */
  
  // Cache the key for future use
  const iv = base64ToUint8Array(options.metadata.iv)
  setCachedKey(videoId, aesKey, iv)
  
  return { aesKey, authContext }
}
```

## Implementation Details

### Secure In-Memory Cache

```typescript
// src/lib/aes-key-cache.ts

import { secureCopy, secureClear } from './crypto'

interface CachedKey {
  videoId: string
  key: Uint8Array    // Copy of the AES key
  iv: Uint8Array     // Copy of the IV
  cachedAt: number
  expiresAt: number
}

// In-memory only — never persisted
const keyCache = new Map<string, CachedKey>()

const DEFAULT_KEY_TTL = 60 * 60 * 1000 // 1 hour

export function getCachedKey(videoId: string): { key: Uint8Array; iv: Uint8Array } | null {
  const cached = keyCache.get(videoId)
  
  if (!cached) return null
  
  // Check expiration
  if (Date.now() >= cached.expiresAt) {
    clearKey(videoId)
    return null
  }
  
  // Return copies (caller may zero-fill their copy after use)
  return {
    key: secureCopy(cached.key),
    iv: secureCopy(cached.iv),
  }
}

export function setCachedKey(
  videoId: string,
  key: Uint8Array,
  iv: Uint8Array,
  ttl: number = DEFAULT_KEY_TTL
): void {
  // Clear existing entry if present
  if (keyCache.has(videoId)) {
    clearKey(videoId)
  }
  
  // Store copies (not references)
  keyCache.set(videoId, {
    videoId,
    key: secureCopy(key),
    iv: secureCopy(iv),
    cachedAt: Date.now(),
    expiresAt: Date.now() + ttl,
  })
}

export function clearKey(videoId: string): void {
  const cached = keyCache.get(videoId)
  if (cached) {
    // Zero-fill before removing (security)
    secureClear(cached.key)
    secureClear(cached.iv)
    keyCache.delete(videoId)
  }
}

export function clearAllKeys(): void {
  for (const [videoId] of keyCache) {
    clearKey(videoId)
  }
}

export function getKeyStats(): {
  count: number
  totalKeyBytes: number
  videoIds: string[]
} {
  const videoIds: string[] = []
  let totalKeyBytes = 0
  
  for (const [id, cached] of keyCache) {
    videoIds.push(id)
    totalKeyBytes += cached.key.byteLength + cached.iv.byteLength
  }
  
  return { count: keyCache.size, totalKeyBytes, videoIds }
}
```

### Page Unload Cleanup

```typescript
// Register cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    clearAllKeys()
  })
  
  // Also clean up on visibility change (tab hidden for extended period)
  // This is optional but adds defense-in-depth
  let hiddenSince: number | null = null
  
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenSince = Date.now()
    } else if (hiddenSince) {
      // If tab was hidden for more than 30 minutes, clear keys
      if (Date.now() - hiddenSince > 30 * 60 * 1000) {
        clearAllKeys()
      }
      hiddenSince = null
    }
  })
}
```

### Wallet Disconnect Integration

```typescript
// In wallet disconnect handler
import { clearAllKeys } from '@/lib/aes-key-cache'
import { clearAuthContext } from '@/lib/lit-session-cache'

function onWalletDisconnect(address: string) {
  clearAllKeys()           // Clear all AES keys
  clearAuthContext(address) // Clear Lit session
}
```

### Performance Impact

| Scenario | Without Key Cache | With Key Cache |
|----------|------------------|----------------|
| Re-decrypt same video | 2-5s (Lit nodes) | **<10ms** (memory lookup) |
| Decrypt after cache eviction | Full pipeline | Skip Lit, just AES decrypt |
| Batch decrypt 5 videos | 5× Lit calls | 1× Lit call + 4× cache hits |

## Acceptance Criteria

- [ ] `getCachedKey()` returns cached key when valid
- [ ] `getCachedKey()` returns `null` when expired
- [ ] `setCachedKey()` stores a **copy** of the key (not a reference)
- [ ] `clearKey()` zero-fills the key before removing from cache
- [ ] `clearAllKeys()` securely clears all cached keys
- [ ] Keys are cleared on page unload (`beforeunload`)
- [ ] Keys are cleared on wallet disconnect
- [ ] Keys are never persisted to disk (no localStorage/sessionStorage/IndexedDB)
- [ ] `decryptAesKey()` checks key cache before contacting Lit nodes
- [ ] Second decryption of same video skips Lit Protocol entirely
- [ ] Key TTL expires correctly

## Dependencies

- Task 3.1 (Lit Session Cache — for coordinated wallet disconnect cleanup)

## Estimated Effort

Medium (3-5 hours)