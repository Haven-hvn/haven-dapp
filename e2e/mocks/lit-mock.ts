/**
 * Lit Protocol Mock for E2E Testing
 *
 * Provides deterministic mock responses for Lit Protocol operations.
 * Avoids real wallet interactions while simulating the decryption flow.
 *
 * @module e2e/mocks/lit-mock
 */

import type { Page } from '@playwright/test'
import { SAMPLE_AES_KEY, SAMPLE_IV } from './synapse-mock'

/**
 * Mock Lit client state
 */
interface MockLitState {
  isInitialized: boolean
  authContext: unknown | null
  sessionSigs: unknown | null
}

/**
 * Default mock state
 */
const defaultState: MockLitState = {
  isInitialized: false,
  authContext: null,
  sessionSigs: null,
}

/**
 * Setup Lit Protocol mock on the page
 */
export async function setupLitMock(page: Page, options: {
  shouldSucceed?: boolean
  delayMs?: number
  simulateWalletRejection?: boolean
} = {}): Promise<void> {
  const { 
    shouldSucceed = true, 
    delayMs = 500,
    simulateWalletRejection = false 
  } = options

  await page.addInitScript(
    ({ shouldSucceed, delayMs, simulateWalletRejection }) => {
      // Initialize mock state
      (window as unknown as Record<string, unknown>).__mockLitState = { ...defaultState }
      
      // Mock Lit client
      Object.defineProperty(window, '__mockLitClient', {
        value: {
          connect: async () => {
            await new Promise(r => setTimeout(r, delayMs))
            
            if (simulateWalletRejection) {
              throw new Error('User rejected the request')
            }
            
            const state = (window as unknown as Record<string, unknown>).__mockLitState as MockLitState
            state.isInitialized = true
          },
          
          disconnect: async () => {
            const state = (window as unknown as Record<string, unknown>).__mockLitState as MockLitState
            state.isInitialized = false
            state.authContext = null
            state.sessionSigs = null
          },
          
          decrypt: async (params: {
            data: { ciphertext: string; dataToEncryptHash: string }
            unifiedAccessControlConditions: unknown[]
            authContext: unknown
            chain: string
          }) => {
            await new Promise(r => setTimeout(r, delayMs))
            
            if (!shouldSucceed) {
              throw new Error('Mock decryption failed')
            }
            
            // Return mock decrypted data (the AES key)
            return {
              decryptedData: new Uint8Array([
                0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
                0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10,
                0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18,
                0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x20,
              ]),
            }
          },
          
          encrypt: async () => {
            await new Promise(r => setTimeout(r, delayMs))
            
            return {
              ciphertext: 'mock-ciphertext',
              dataToEncryptHash: '0x' + '00'.repeat(32),
            }
          },
        },
        writable: true,
        configurable: true,
      })

      // Mock getLitClient to return our mock
      Object.defineProperty(window, 'getLitClient', {
        value: () => {
          const state = (window as unknown as Record<string, unknown>).__mockLitState as MockLitState
          if (!state.isInitialized) {
            throw new Error('Lit client not initialized')
          }
          return (window as unknown as Record<string, unknown>).__mockLitClient
        },
        writable: true,
        configurable: true,
      })

      // Mock createLitAuthContext
      Object.defineProperty(window, 'createLitAuthContext', {
        value: async () => {
          await new Promise(r => setTimeout(r, delayMs / 2))
          
          if (simulateWalletRejection) {
            throw new Error('User rejected the signature request')
          }
          
          const authContext = { mock: true, timestamp: Date.now() }
          const state = (window as unknown as Record<string, unknown>).__mockLitState as MockLitState
          state.authContext = authContext
          
          return authContext
        },
        writable: true,
        configurable: true,
      })

      // Mock initLitClient
      Object.defineProperty(window, 'initLitClient', {
        value: async () => {
          await new Promise(r => setTimeout(r, delayMs))
          
          if (simulateWalletRejection) {
            throw new Error('Connection rejected')
          }
          
          const state = (window as unknown as Record<string, unknown>).__mockLitState as MockLitState
          state.isInitialized = true
        },
        writable: true,
        configurable: true,
      })
    },
    { shouldSucceed, delayMs, simulateWalletRejection }
  )
}

/**
 * Reset the Lit mock state
 */
export async function resetLitMock(page: Page): Promise<void> {
  await page.evaluate(() => {
    const state = (window as unknown as Record<string, unknown>).__mockLitState as MockLitState
    state.isInitialized = false
    state.authContext = null
    state.sessionSigs = null
  })
}

/**
 * Set Lit mock to initialized state (bypassing connection)
 */
export async function setLitMockInitialized(page: Page, initialized = true): Promise<void> {
  await page.evaluate((initialized) => {
    const state = (window as unknown as Record<string, unknown>).__mockLitState as MockLitState
    state.isInitialized = initialized
  }, initialized)
}

/**
 * Mock AES key cache for testing
 */
export async function setupAesKeyCacheMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // Mock AES key cache
    const keyCache = new Map<string, { key: Uint8Array; iv: Uint8Array; timestamp: number }>()
    
    Object.defineProperty(window, '__mockAesKeyCache', {
      value: keyCache,
      writable: true,
      configurable: true,
    })

    // Mock getCachedKey
    Object.defineProperty(window, 'getCachedKey', {
      value: (videoId: string) => {
        const cached = keyCache.get(videoId)
        if (cached && Date.now() - cached.timestamp < 30 * 60 * 1000) {
          return cached
        }
        return null
      },
      writable: true,
      configurable: true,
    })

    // Mock setCachedKey
    Object.defineProperty(window, 'setCachedKey', {
      value: (videoId: string, key: Uint8Array, iv: Uint8Array) => {
        keyCache.set(videoId, { key: new Uint8Array(key), iv: new Uint8Array(iv), timestamp: Date.now() })
      },
      writable: true,
      configurable: true,
    })

    // Mock clearKeyCache
    Object.defineProperty(window, 'clearKeyCache', {
      value: () => {
        keyCache.clear()
      },
      writable: true,
      configurable: true,
    })
  })
}

/**
 * Clear the AES key cache
 */
export async function clearAesKeyCache(page: Page): Promise<void> {
  await page.evaluate(() => {
    const keyCache = (window as unknown as Record<string, Map<string, unknown>>).__mockAesKeyCache
    keyCache?.clear()
  })
}
