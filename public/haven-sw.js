/**
 * Haven Service Worker
 *
 * Intercepts requests to synthetic URLs (/haven/v/{videoId}) and serves
 * decrypted video content from the Cache API. This makes the caching layer
 * completely transparent to the video element.
 */

const CACHE_NAME = 'haven-video-cache-v1'
const CACHE_VERSION = 1
const VIDEO_URL_PREFIX = '/haven/v/'

/**
 * Service Worker install event
 * Skip waiting to activate immediately
 */
self.addEventListener('install', (event) => {
  self.skipWaiting()
})

/**
 * Service Worker message event
 * Handle messages from the main thread (e.g., skip waiting)
 */
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

/**
 * Service Worker activate event
 * Claim clients and clean up old cache versions
 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Take control of all clients immediately
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

/**
 * Service Worker fetch event
 * Intercept requests to /haven/v/* and serve from cache
 */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Only intercept /haven/v/* requests
  if (!url.pathname.startsWith(VIDEO_URL_PREFIX)) {
    return // Let the request pass through to the network
  }

  event.respondWith(handleVideoRequest(event.request))
})

/**
 * Handle video requests from cache
 * @param {Request} request - The incoming request
 * @returns {Promise<Response>} - The cached response or 404
 */
async function handleVideoRequest(request) {
  try {
    const cache = await caches.open(CACHE_NAME)
    const cachedResponse = await cache.match(request.url)

    if (!cachedResponse) {
      return new Response('Video not found in cache', {
        status: 404,
        statusText: 'Not Found',
        headers: {
          'Content-Type': 'text/plain',
        },
      })
    }

    // Handle Range requests for video seeking
    const rangeHeader = request.headers.get('Range')
    if (rangeHeader) {
      return handleRangeRequest(cachedResponse, rangeHeader)
    }

    return cachedResponse
  } catch (error) {
    console.error('[Haven SW] Error handling video request:', error)
    return new Response('Internal Server Error', {
      status: 500,
      statusText: 'Internal Server Error',
    })
  }
}

/**
 * Handle HTTP Range requests for video seeking
 * Parses Range header and returns appropriate slice of cached content
 * @param {Response} response - The cached response
 * @param {string} rangeHeader - The Range header value (e.g., "bytes=0-1023")
 * @returns {Promise<Response>} - 206 Partial Content response
 */
async function handleRangeRequest(response, rangeHeader) {
  const blob = await response.blob()
  const totalSize = blob.size
  const contentType = response.headers.get('Content-Type') || 'video/mp4'

  // Parse Range header: "bytes=start-end" or "bytes=start-"
  const rangeMatch = rangeHeader.match(/bytes=(\d+)-(\d*)/)
  if (!rangeMatch) {
    return new Response('Invalid Range header', {
      status: 400,
      statusText: 'Bad Request',
    })
  }

  const start = parseInt(rangeMatch[1], 10)
  const endStr = rangeMatch[2]
  const end = endStr ? parseInt(endStr, 10) : totalSize - 1

  // Validate range
  if (start < 0 || end >= totalSize || start > end) {
    return new Response('Range Not Satisfiable', {
      status: 416,
      statusText: 'Range Not Satisfiable',
      headers: {
        'Content-Range': `bytes */${totalSize}`,
      },
    })
  }

  const slicedBlob = blob.slice(start, end + 1)
  const contentLength = end - start + 1

  return new Response(slicedBlob, {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': contentType,
      'Content-Range': `bytes ${start}-${end}/${totalSize}`,
      'Content-Length': String(contentLength),
      'Accept-Ranges': 'bytes',
    },
  })
}
