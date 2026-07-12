/**
 * Synapse SDK Mock for E2E Testing
 *
 * Provides deterministic mock responses for Synapse SDK operations.
 * This allows tests to run without actual Filecoin network access.
 *
 * @module e2e/mocks/synapse-mock
 */

import type { Page } from '@playwright/test'

/**
 * Test video data store - maps CID to mock video data
 */
const mockVideoStore = new Map<string, Uint8Array>()

/**
 * Sample encrypted video data for testing (simulating encrypted content)
 */
export const SAMPLE_VIDEO_DATA = new Uint8Array([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, // ftyp box header
  0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x00, 0x00, // isom brand
  0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x31, // compatible brands
  // Add more mock MP4 data
  ...Array(1024).fill(0).map((_, i) => (i * 7) % 256),
])

/**
 * Sample decryption key (256-bit AES key)
 */
export const SAMPLE_AES_KEY = new Uint8Array([
  0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10,
  0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18,
  0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x20,
])

/**
 * Sample IV for AES-GCM
 */
export const SAMPLE_IV = new Uint8Array([
  0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17,
  0x18, 0x19, 0x1a, 0x1b,
])

/**
 * Mock CID for testing
 */
export const MOCK_CID = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'

/**
 * Mock encrypted CID for testing
 */
export const MOCK_ENCRYPTED_CID = 'bafybeianotherencryptedcidforsprint6tests'

/**
 * Video fixture metadata
 */
export interface VideoFixture {
  id: string
  cid: string
  encryptedCid?: string
  title: string
  duration: number
  size: number
  data: Uint8Array
  isEncrypted: boolean
  encryptionMetadata?: {
    encryptedKey: string
    keyHash: string
    iv: string
    accessControlConditions: unknown[]
    chain: string
  }
}

/**
 * Create a mock video fixture
 */
export function createVideoFixture(overrides: Partial<VideoFixture> = {}): VideoFixture {
  const id = overrides.id || `0x${Math.random().toString(16).slice(2, 18)}`
  const size = overrides.size || 1024 * 1024 // 1MB default
  
  // Generate deterministic data based on ID
  const data = new Uint8Array(size)
  const baseData = SAMPLE_VIDEO_DATA
  for (let i = 0; i < size; i++) {
    data[i] = baseData[i % baseData.length] ^ (i & 0xff)
  }

  return {
    id,
    cid: MOCK_CID,
    title: 'Test Video',
    duration: 120,
    size,
    data,
    isEncrypted: false,
    ...overrides,
  }
}

/**
 * Create an encrypted video fixture
 */
export function createEncryptedVideoFixture(
  overrides: Partial<VideoFixture> = {}
): VideoFixture {
  const base = createVideoFixture(overrides)
  
  return {
    ...base,
    isEncrypted: true,
    encryptedCid: MOCK_ENCRYPTED_CID,
    encryptionMetadata: {
      encryptedKey: 'mock-encrypted-key-base64',
      keyHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      iv: btoa(String.fromCharCode(...SAMPLE_IV)),
      accessControlConditions: [
        {
          contractAddress: '',
          standardContractType: '',
          chain: 'ethereum',
          method: '',
          parameters: [':userAddress'],
          returnValueTest: {
            comparator: '=',
            value: '0xabcdef1234567890abcdef1234567890abcdef12',
          },
        },
      ],
      chain: 'ethereum',
    },
    ...overrides,
  }
}

/**
 * Setup Synapse SDK mock on the page
 */
export async function setupSynapseMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // Store for mock data
    (window as unknown as Record<string, unknown>).__mockSynapseStore = new Map()
    
    // Mock Synapse SDK
    Object.defineProperty(window, 'Synapse', {
      value: {
        create: () => ({
          storage: {
            download: async ({ pieceCid }: { pieceCid: string }) => {
              const store = (window as unknown as Record<string, unknown>).__mockSynapseStore as Map<string, Uint8Array>
              const data = store.get(pieceCid)
              
              if (!data) {
                throw new Error(`Mock: CID not found: ${pieceCid}`)
              }
              
              // Simulate network delay
              await new Promise(r => setTimeout(r, 100))
              
              return data
            },
          },
        }),
      },
      writable: true,
      configurable: true,
    })
  })
}

/**
 * Register mock video data with the Synapse mock
 */
export async function registerMockVideo(
  page: Page,
  cid: string,
  data: Uint8Array
): Promise<void> {
  await page.evaluate(
    ({ cid, data }) => {
      const store = (window as unknown as Record<string, unknown>).__mockSynapseStore as Map<string, Uint8Array>
      store.set(cid, new Uint8Array(data))
    },
    { cid, data: Array.from(data) }
  )
}

/**
 * Clear all mock video data
 */
export async function clearMockVideos(page: Page): Promise<void> {
  await page.evaluate(() => {
    const store = (window as unknown as Record<string, unknown>).__mockSynapseStore as Map<string, Uint8Array>
    store.clear()
  })
}

/**
 * Mock video fixtures for testing
 */
export const VIDEO_FIXTURES = {
  small: createVideoFixture({ id: '0xsmallvideo', title: 'Small Test Video', size: 1024 * 100 }), // 100KB
  medium: createVideoFixture({ id: '0xmediumvideo', title: 'Medium Test Video', size: 1024 * 1024 }), // 1MB
  large: createVideoFixture({ id: '0xlargevideo', title: 'Large Test Video', size: 1024 * 1024 * 5 }), // 5MB
  encrypted: createEncryptedVideoFixture({ id: '0xencryptedvideo', title: 'Encrypted Test Video' }),
  encryptedSmall: createEncryptedVideoFixture({ 
    id: '0xencryptedsmall', 
    title: 'Small Encrypted Video',
    size: 1024 * 100 
  }),
}
