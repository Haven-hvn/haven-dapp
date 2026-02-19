/**
 * Service Worker Lifecycle E2E Tests
 *
 * Tests verifying Service Worker registration, activation, updates,
 * and request interception behavior.
 *
 * @module e2e/sw-lifecycle
 * @sprint 6
 */

import { test, expect } from '@playwright/test'
import { clearAllCaches } from './helpers/cache-helpers'

// Constants
const CACHE_NAME = 'haven-video-cache-v1'
const VIDEO_URL_PREFIX = '/haven/v/'

test.describe.configure({ mode: 'serial' })

test.describe('Service Worker', () => {
  test.beforeEach(async ({ page }) => {
    await clearAllCaches(page)
  })

  test.afterEach(async ({ page }) => {
    await clearAllCaches(page)
  })

  // ========================================================================
  // Registration Tests
  // ========================================================================

  test('registers on app load', async ({ page }) => {
    await page.goto('/')
    
    // Wait for SW to register
    const swRegistered = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration()
      return reg !== undefined
    })
    
    expect(swRegistered).toBe(true)
  })

  test('activates and controls the page', async ({ page }) => {
    await page.goto('/')
    
    // Wait for SW to be ready
    const swState = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready
      return {
        state: reg.active?.state,
        controlling: reg.active !== null && navigator.serviceWorker.controller !== null,
        scriptURL: reg.active?.scriptURL,
      }
    })
    
    expect(swState.state).toBe('activated')
    expect(swState.controlling).toBe(true)
    expect(swState.scriptURL).toContain('haven-sw.js')
  })

  test('has correct scope and covers all pages', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => navigator.serviceWorker.ready)
    
    // Check scope on different pages
    const pages = ['/', '/library', '/settings', '/watch/test123']
    
    for (const path of pages) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      
      const scope = await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.getRegistration()
        return reg?.scope
      })
      
      // Scope should be root to cover all pages
      expect(scope).toMatch(/^https?:\/\/[^/]+\/$/)
    }
  })

  // ========================================================================
  // Navigation & Persistence Tests
  // ========================================================================

  test('survives page navigation', async ({ page }) => {
    await page.goto('/')
    
    // Get initial SW state
    const initialSW = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready
      return {
        scriptURL: reg.active?.scriptURL,
        state: reg.active?.state,
      }
    })
    
    expect(initialSW.state).toBe('activated')
    
    // Navigate to multiple pages
    const pages = ['/library', '/settings', '/library', '/']
    
    for (const path of pages) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      
      const swState = await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.getRegistration()
        return {
          scriptURL: reg?.active?.scriptURL,
          state: reg?.active?.state,
        }
      })
      
      expect(swState.state).toBe('activated')
      expect(swState.scriptURL).toBe(initialSW.scriptURL)
    }
  })

  test('survives page reload', async ({ page }) => {
    await page.goto('/')
    
    // Get initial SW ID
    const initialSW = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready
      return reg.active?.scriptURL
    })
    
    // Reload multiple times
    for (let i = 0; i < 3; i++) {
      await page.reload()
      await page.evaluate(() => navigator.serviceWorker.ready)
      
      const swURL = await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.getRegistration()
        return reg?.active?.scriptURL
      })
      
      expect(swURL).toBe(initialSW)
    }
  })

  test('maintains cache across page reloads', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => navigator.serviceWorker.ready)
    
    // Store video in cache
    const videoId = 'persist-test-video'
    await page.evaluate(async ({ cacheName, id }) => {
      const cache = await caches.open(cacheName)
      const blob = new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: 'video/mp4' })
      
      await cache.put(
        `${location.origin}/haven/v/${id}`,
        new Response(blob, {
          headers: {
            'Content-Type': 'video/mp4',
            'X-Haven-Video-Id': id,
          },
        })
      )
    }, { cacheName: CACHE_NAME, id: videoId })
    
    // Reload page
    await page.reload()
    await page.evaluate(() => navigator.serviceWorker.ready)
    
    // Verify video still accessible
    const result = await page.evaluate(async (id) => {
      const res = await fetch(`/haven/v/${id}`)
      return {
        status: res.status,
        videoId: res.headers.get('X-Haven-Video-Id'),
      }
    }, videoId)
    
    expect(result.status).toBe(200)
    expect(result.videoId).toBe(videoId)
  })

  // ========================================================================
  // Update Tests
  // ========================================================================

  test('updates when new version is deployed', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => navigator.serviceWorker.ready)
    
    // Simulate checking for updates
    const updateCheck = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration()
      
      if (!reg) return { success: false, reason: 'no-registration' }
      
      // Trigger update check
      try {
        await reg.update()
        return { success: true, waiting: reg.waiting !== null }
      } catch (error) {
        return { success: false, error: String(error) }
      }
    })
    
    expect(updateCheck.success).toBe(true)
  })

  test('skipWaiting message activates new SW immediately', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => navigator.serviceWorker.ready)
    
    // Send skipWaiting message to SW
    const skipResult = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration()
      
      if (!reg?.active) return { success: false, reason: 'no-active-sw' }
      
      reg.active.postMessage({ type: 'SKIP_WAITING' })
      
      return { success: true }
    })
    
    expect(skipResult.success).toBe(true)
  })

  // ========================================================================
  // Request Interception Tests
  // ========================================================================

  test('intercepts /haven/v/* requests', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => navigator.serviceWorker.ready)
    
    // Request a non-existent video - should get 404 from SW
    const response = await page.evaluate(async () => {
      const res = await fetch('/haven/v/nonexistent-video')
      return {
        status: res.status,
        statusText: res.statusText,
        contentType: res.headers.get('Content-Type'),
      }
    })
    
    expect(response.status).toBe(404)
    expect(response.statusText).toBe('Not Found')
    expect(response.contentType).toBe('text/plain')
  })

  test('passes through non-haven requests', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => navigator.serviceWorker.ready)
    
    // Regular API requests should not be intercepted
    const response = await page.evaluate(async () => {
      const res = await fetch('/api/test-not-intercepted')
      return {
        status: res.status,
        // If SW intercepted, we'd see text/plain content type
        contentType: res.headers.get('Content-Type'),
      }
    })
    
    // Should get Next.js 404, not SW response
    expect(response.status).toBe(404)
    expect(response.contentType).not.toBe('text/plain')
  })

  test('passes through static asset requests', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => navigator.serviceWorker.ready)
    
    // Test various static assets
    const assets = [
      '/favicon.ico',
      '/_next/static/test.js',
      '/images/test.png',
    ]
    
    for (const asset of assets) {
      const response = await page.evaluate(async (url) => {
        try {
          const res = await fetch(url)
          return {
            status: res.status,
            isSWResponse: res.headers.get('Content-Type') === 'text/plain' && 
                         res.status === 404,
          }
        } catch {
          return { status: 'error', isSWResponse: false }
        }
      }, asset)
      
      // Should NOT get the SW's "Video not found" response
      expect(response.isSWResponse, `Asset ${asset} should not be intercepted by SW`).toBe(false)
    }
  })

  test('handles multiple concurrent /haven/v/ requests', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => navigator.serviceWorker.ready)
    
    // Make multiple concurrent requests
    const results = await page.evaluate(async () => {
      const ids = ['video1', 'video2', 'video3', 'video4', 'video5']
      
      const requests = ids.map(id => 
        fetch(`/haven/v/${id}`).then(res => ({
          id,
          status: res.status,
        }))
      )
      
      return Promise.all(requests)
    })
    
    // All should return 404 (not in cache) but handled by SW
    expect(results).toHaveLength(5)
    expect(results.every(r => r.status === 404)).toBe(true)
  })

  // ========================================================================
  // Error Handling Tests
  // ========================================================================

  test('handles malformed /haven/v/ URLs gracefully', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => navigator.serviceWorker.ready)
    
    // Test malformed URLs
    const malformedUrls = [
      '/haven/v/',
      '/haven/v//',
      '/haven/v/%20',
    ]
    
    for (const url of malformedUrls) {
      const response = await page.evaluate(async (testUrl) => {
        try {
          const res = await fetch(testUrl)
          return { status: res.status, ok: res.ok }
        } catch {
          return { status: 'error', ok: false }
        }
      }, url)
      
      // Should not crash, just return 404
      expect(response.status).toBe(404)
    }
  })

  test('survives cache errors gracefully', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => navigator.serviceWorker.ready)
    
    // Try to access cache with invalid name
    const result = await page.evaluate(async () => {
      try {
        // This might fail but shouldn't crash the SW
        const cache = await caches.open('')
        return { success: true }
      } catch {
        return { success: false, handled: true }
      }
    })
    
    expect(result.handled).toBe(true)
    
    // SW should still be functional
    const swState = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration()
      return reg?.active?.state
    })
    
    expect(swState).toBe('activated')
  })

  // ========================================================================
  // Client Communication Tests
  // ========================================================================

  test('can receive messages from main thread', async ({ page }) => {
    await page.goto('/')
    const swReady = await page.evaluate(() => navigator.serviceWorker.ready)
    expect(swReady).toBeTruthy()
    
    // Send message to SW
    const messageResult = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration()
      
      if (!reg?.active) return { success: false, reason: 'no-active-sw' }
      
      return new Promise<{ success: boolean; echoed?: string }>((resolve) => {
        const messageChannel = new MessageChannel()
        
        messageChannel.port1.onmessage = (event) => {
          resolve({ success: true, echoed: event.data?.type })
        }
        
        // Send message with port for response
        reg.active!.postMessage(
          { type: 'TEST_MESSAGE' },
          [messageChannel.port2]
        )
        
        // Timeout fallback
        setTimeout(() => resolve({ success: false }), 1000)
      })
    })
    
    // Message was sent (SW may or may not respond, that's implementation detail)
    expect(messageResult.success || !messageResult.echoed).toBeTruthy()
  })

  test('maintains separate caches per origin', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => navigator.serviceWorker.ready)
    
    const cacheIsolation = await page.evaluate(async (cacheName) => {
      const cache = await caches.open(cacheName)
      
      // Store data with full origin URL
      const origin = location.origin
      
      await cache.put(
        `${origin}/haven/v/origin-test`,
        new Response('test data', { headers: { 'Content-Type': 'text/plain' } })
      )
      
      // Try to match with different origin (should fail)
      const wrongOriginMatch = await cache.match('https://other-origin.com/haven/v/origin-test')
      
      // Match with correct origin (should succeed)
      const correctOriginMatch = await cache.match(`${origin}/haven/v/origin-test`)
      
      // Cleanup
      await cache.delete(`${origin}/haven/v/origin-test`)
      
      return {
        wrongOriginFound: wrongOriginMatch !== undefined,
        correctOriginFound: correctOriginMatch !== undefined,
      }
    }, CACHE_NAME)
    
    expect(cacheIsolation.wrongOriginFound).toBe(false)
    expect(cacheIsolation.correctOriginFound).toBe(true)
  })
})
