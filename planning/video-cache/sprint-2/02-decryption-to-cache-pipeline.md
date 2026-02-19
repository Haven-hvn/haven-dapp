# Task 2.2: Decryption-to-Cache Direct Pipeline

## Objective

Modify the decryption pipeline to write decrypted output directly to the Cache API instead of creating an intermediate blob URL. This eliminates one full copy of the video from JS heap memory and removes the blob URL lifecycle management.

## Background

### Current Flow (Wasteful)

```
encryptedData (Uint8Array, ~500MB in heap)
    ↓ aesDecrypt()
decryptedData (Uint8Array, ~500MB in heap)
    ↓ new Blob([toArrayBuffer(decryptedData)])
blob (Blob, ~500MB — may or may not be in heap)
    ↓ URL.createObjectURL(blob)
blobUrl (string — blob stays in memory until revoked)
    ↓ fetch(blobUrl) → blob → putVideo()  [if caching]
Cache API (on disk)
```

The blob URL step is entirely unnecessary when we have the Cache API. We can write the decrypted `Uint8Array` directly to cache.

### New Flow (Optimized)

```
encryptedData (Uint8Array, ~500MB)
    ↓ aesDecrypt()
decryptedData (Uint8Array, ~500MB)
    ↓ putVideo(videoId, decryptedData, mimeType)
Cache API (on disk)
    ↓ set <video src="/haven/v/{id}">
Service Worker serves from disk
```

No blob URL. No intermediate blob. The decrypted bytes go straight to disk via Cache API.

## Requirements

### New Decryption Function (`src/lib/crypto.ts` addition)

1. **`aesDecryptToCache(encryptedData, key, iv, videoId, mimeType)`**
   - Decrypt using Web Crypto API (same as `aesDecrypt`)
   - Write result directly to Cache API via `putVideo()`
   - Return the synthetic URL `/haven/v/{videoId}`
   - Clear the decrypted `Uint8Array` from memory after cache write

### Modified `useVideoDecryption` Hook

Update the hook to write directly to Cache API:

- Skip blob creation entirely
- Write decrypted bytes to Cache API
- Return `/haven/v/{videoId}` as the URL
- Clear decrypted bytes from memory immediately after cache write

## Implementation Details

### Direct-to-Cache Decryption

```typescript
// Addition to src/lib/crypto.ts

import { putVideo } from './video-cache'

/**
 * Decrypt data and write directly to Cache API.
 * Avoids creating an intermediate blob URL.
 * 
 * @returns The synthetic URL for the cached video
 */
export async function aesDecryptToCache(
  encryptedData: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array,
  videoId: string,
  mimeType: string = 'video/mp4'
): Promise<string> {
  // Decrypt using Web Crypto API
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  )
  
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    encryptedData
  )
  
  // Write directly to Cache API — no blob URL needed
  const decryptedData = new Uint8Array(decryptedBuffer)
  await putVideo(videoId, decryptedData, mimeType)
  
  // Help GC reclaim the decrypted buffer
  // (The Cache API has its own copy on disk now)
  
  return `/haven/v/${videoId}`
}
```

### Hook Modification

```typescript
// In useVideoDecryption.ts decrypt() function

updateProgress('decrypting-file', 'Decrypting and caching video...')

const mimeType = video.litEncryptionMetadata.originalMimeType || 'video/mp4'

const url = await aesDecryptToCache(
  encryptedData,
  aesKey,
  iv,
  video.id,
  mimeType
)

// Clear key from memory
aesKey.fill(0)

if (isMountedRef.current) {
  setDecryptedUrl(url)
  setStatus('complete')
}

return url
```

### Memory Lifecycle Comparison

| Step | Before | After |
|------|--------|-------|
| After Synapse fetch | encrypted (heap) | encrypted (heap or OPFS) |
| After decrypt | encrypted + decrypted (heap) | encrypted + decrypted (heap) |
| After cache write | encrypted + decrypted + blob (heap) | encrypted (heap, can be GC'd) |
| After cleanup | blob URL in memory | nothing in heap |
| **Steady state** | **blob in heap until revoke** | **zero heap, served from disk** |

## Acceptance Criteria

- [ ] `aesDecryptToCache()` decrypts and writes to Cache API in one step
- [ ] No blob URL is created — decrypted bytes go directly to Cache API
- [ ] Decrypted bytes are eligible for GC after cache write
- [ ] `useVideoDecryption` writes directly to Cache API
- [ ] AES key is cleared from memory after use
- [ ] Video plays correctly from the cached URL via Service Worker

## Dependencies

- Task 1.2 (Cache API Wrapper — `putVideo()`)
- Task 1.1 (Service Worker — serves `/haven/v/*`)

## Estimated Effort

Medium (4-5 hours)