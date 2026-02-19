'use client'

import { useState, useEffect } from 'react'

/**
 * Service Worker registration state
 */
interface ServiceWorkerState {
  /** True when the service worker is active and ready to handle requests */
  isReady: boolean
  /** True if service workers are supported in this environment */
  isSupported: boolean
  /** Any error that occurred during registration */
  error: Error | null
  /** The service worker registration object */
  registration: ServiceWorkerRegistration | null
}

/**
 * React hook to register and manage the Haven Service Worker
 *
 * This hook handles the lifecycle of the Service Worker registration,
 * including install, waiting, and activation states. It also handles
 * updates gracefully by skipping waiting and claiming clients.
 *
 * @returns ServiceWorkerState object with registration status
 *
 * @example
 * ```tsx
 * function App() {
 *   const { isReady, isSupported, error } = useServiceWorker()
 *
 *   if (!isSupported) {
 *     return <div>Service workers not supported</div>
 *   }
 *
 *   if (error) {
 *     return <div>Failed to register service worker: {error.message}</div>
 *   }
 *
 *   return <div>{isReady ? 'Ready' : 'Loading...'}</div>
 * }
 * ```
 */
export function useServiceWorker(): ServiceWorkerState {
  const [state, setState] = useState<ServiceWorkerState>({
    isReady: false,
    isSupported: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
    error: null,
    registration: null,
  })

  useEffect(() => {
    // Skip if service workers are not supported (SSR, older browsers)
    if (!state.isSupported) {
      return
    }

    // Skip in development unless explicitly enabled
    const isDevelopment = process.env.NODE_ENV === 'development'
    const enableInDev = process.env.NEXT_PUBLIC_ENABLE_SW_IN_DEV === 'true'
    if (isDevelopment && !enableInDev) {
      return
    }

    let isMounted = true

    const registerServiceWorker = async () => {
      try {
        // Register the service worker
        const registration = await navigator.serviceWorker.register('/haven-sw.js', {
          scope: '/',
        })

        if (!isMounted) return

        // Set the registration in state
        setState(prev => ({ ...prev, registration }))

        // Check if there's a waiting service worker and skip waiting
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' })
        }

        // Handle updates: when a new service worker is waiting
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing
          if (!newWorker) return

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New version is waiting, skip waiting to activate immediately
              newWorker.postMessage({ type: 'SKIP_WAITING' })
            }
          })
        })

        // Wait for the service worker to be active
        const activeWorker = registration.active
        if (activeWorker?.state === 'activated') {
          setState(prev => ({ ...prev, isReady: true }))
        } else {
          // Listen for state changes on installing/waiting worker
          const targetWorker = registration.installing || registration.waiting
          if (targetWorker) {
            targetWorker.addEventListener('statechange', () => {
              if (targetWorker.state === 'activated') {
                setState(prev => ({ ...prev, isReady: true }))
              }
            })
          }
        }
      } catch (err) {
        if (!isMounted) return

        setState(prev => ({
          ...prev,
          error: err instanceof Error ? err : new Error('Service Worker registration failed'),
        }))
      }
    }

    registerServiceWorker()

    return () => {
      isMounted = false
    }
  }, [state.isSupported])

  return state
}

export type { ServiceWorkerState }
