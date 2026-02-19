# Task 1.1: Service Worker Setup & Registration

## Objective

Create the Haven Service Worker (`haven-sw.js`) and a React hook to register it. The Service Worker will intercept requests to synthetic URLs (`/haven/v/{videoId}`) and serve decrypted video content from the Cache API.

## Background

The `<video>` element makes standard HTTP requests for its `src` URL. A Service Worker can intercept these requests and respond with cached content, making the caching layer completely transparent to the video element. This is the foundation that all other caching features build upon.

## Requirements

### Service Worker (`public/haven-sw.js`)

1. **Intercept pattern**: Only intercept requests matching `/haven/v/{videoId}`
2. **Cache lookup**: Check the `haven-video-cache` Cache API store for a matching response
3. **Range request support**: Handle HTTP `Range` headers for video seeking
   - Parse `Range: bytes=start-end` header
   - Slice the cached `Response` body accordingly
   - Return `206 Partial Content` with correct `Content-Range` header
4. **Cache miss**: Return `404 Not Found` if the video is not in cache
5. **Pass-through**: All other requests pass through to the network unchanged
6. **Versioning**: Include a `CACHE_VERSION` constant for future cache migrations

### Registration Hook (`src/hooks/useServiceWorker.ts`)

1. Register the Service Worker on app mount
2. Handle registration lifecycle (installing, waiting, active)
3. Expose registration state: `{ isReady, isSupported, error, registration }`
4. Handle updates gracefully (skip waiting, claim clients)
5. Only register in production or when explicitly enabled in development

## Implementation Details

### Service Worker Skeleton

```javascript
// public/haven-sw.js
const CACHE_NAME = 'haven-video-cache-v1'
const CACHE_VERSION = 1
const VIDEO_URL_PREFIX = '/haven/v/'

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Clean up old cache versions
      caches.keys().then(keys => 
        Promise.all(
          keys
            .filter(key => key.startsWith('haven-video-cache-') && key !== CACHE_NAME)
            .map(key => caches.delete(key))
        )
      )
    ])
  )
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  
  // Only intercept /haven/v/* requests
  if (!url.pathname.startsWith(VIDEO_URL_PREFIX)) {
    return // Let the request pass through
  }
  
  event.respondWith(handleVideoRequest(event.request))
})

async function handleVideoRequest(request) {
  const cache = await caches.open(CACHE_NAME)
  const cachedResponse = await cache.match(request.url)
  
  if (!cachedResponse) {
    return new Response('Video not found in cache', { status: 404 })
  }
  
  // Handle Range requests for video seeking
  const rangeHeader = request.headers.get('Range')
  if (rangeHeader) {
    return handleRangeRequest(cachedResponse, rangeHeader)
  }
  
  return cachedResponse
}

async function handleRangeRequest(response, rangeHeader) {
  const blob = await response.blob()
  const totalSize = blob.size
  
  // Parse Range header: "bytes=start-end"
  const [, range] = rangeHeader.match(/bytes=(\d+)-(\d*)/) || []
  const start = parseInt(range, 10)
  const end = rangeHeader.match(/bytes=\d+-(\d+)/)?.[1]
    ? parseInt(rangeHeader.match(/bytes=\d+-(\d+)/)[1], 10)
    : totalSize - 1
  
  const slicedBlob = blob.slice(start, end + 1)
  
  return new Response(slicedBlob, {
    status: 206,
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'video/mp4',
      'Content-Range': `bytes ${start}-${end}/${totalSize}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  })
}
```

### Registration Hook Skeleton

```typescript
// src/hooks/useServiceWorker.ts
'use client'

import { useState, useEffect, useCallback } from 'react'

interface ServiceWorkerState {
  isReady: boolean
  isSupported: boolean
  error: Error | null
  registration: ServiceWorkerRegistration | null
}

export function useServiceWorker(): ServiceWorkerState {
  const [state, setState] = useState<ServiceWorkerState>({
    isReady: false,
    isSupported: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
    error: null,
    registration: null,
  })

  useEffect(() => {
    if (!state.isSupported) return

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/haven-sw.js', {
          scope: '/',
        })

        // Wait for the SW to be active
        const sw = registration.active || registration.waiting || registration.installing
        if (sw?.state === 'activated') {
          setState(prev => ({ ...prev, isReady: true, registration }))
        } else {
          sw?.addEventListener('statechange', () => {
            if (sw.state === 'activated') {
              setState(prev => ({ ...prev, isReady: true, registration }))
            }
          })
        }
      } catch (err) {
        setState(prev => ({
          ...prev,
          error: err instanceof Error ? err : new Error('SW registration failed'),
        }))
      }
    }

    register()
  }, [state.isSupported])

  return state
}
```

## Acceptance Criteria

- [ ] Service Worker file exists at `public/haven-sw.js`
- [ ] SW only intercepts `/haven/v/*` requests; all other requests pass through
- [ ] SW returns cached video content with correct `Content-Type` header
- [ ] SW handles `Range` requests and returns `206 Partial Content`
- [ ] SW returns `404` for cache misses
- [ ] SW cleans up old cache versions on activation
- [ ] `useServiceWorker` hook registers the SW and reports readiness
- [ ] SW registration is skipped when `serviceWorker` is not supported (SSR, older browsers)
- [ ] No console errors during normal operation

## Dependencies

- None (this is the foundation task)

## Estimated Effort

Medium (4-6 hours)