/**
 * Content Retrieval Service Tests
 * 
 * Unit tests for the Synapse SDK content retrieval service.
 * 
 * @module services/__tests__/ipfsService
 */

import {
  fetchFromIpfs,
  streamFromIpfs,
  fetchEncryptedData,
  fetchMultiple,
} from '../ipfsService'
import { IpfsError, isValidCid } from '@/lib/ipfs'

// Mock the Synapse SDK download
jest.mock('@/lib/synapse', () => ({
  downloadFromSynapse: jest.fn(),
  SynapseError: class SynapseError extends Error {
    code: string
    constructor(message: string, code: string) {
      super(message)
      this.code = code
      this.name = 'SynapseError'
    }
  },
}))

import { downloadFromSynapse } from '@/lib/synapse'

// Mock performance.now
Object.defineProperty(global, 'performance', {
  value: {
    now: jest.fn(() => 0),
  },
  writable: true,
})

describe('ipfsService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('isValidCid', () => {
    it('should return true for valid CIDs', () => {
      expect(isValidCid('QmValidCid123')).toBe(true)
      expect(isValidCid('bafybeifoo')).toBe(true)
    })

    it('should return false for invalid CIDs', () => {
      expect(isValidCid('')).toBe(false)
      expect(isValidCid(null as unknown as string)).toBe(false)
      expect(isValidCid(undefined as unknown as string)).toBe(false)
      expect(isValidCid('ab')).toBe(false)
    })

    it('should handle CID with ipfs:// prefix', () => {
      expect(isValidCid('ipfs://QmValidCid')).toBe(true)
    })

    it('should handle CID with leading slash', () => {
      expect(isValidCid('/QmValidCid')).toBe(true)
    })
  })

  describe('fetchFromIpfs', () => {
    const mockCid = 'QmTestCid123456789'
    const mockData = new Uint8Array([1, 2, 3, 4, 5])
    
    it('should throw IpfsError for invalid CID', async () => {
      await expect(fetchFromIpfs('')).rejects.toThrow(IpfsError)
      await expect(fetchFromIpfs('invalid')).rejects.toThrow('Invalid CID')
    })

    it('should fetch successfully from Synapse SDK', async () => {
      ;(downloadFromSynapse as jest.Mock).mockResolvedValueOnce(mockData)

      const result = await fetchFromIpfs(mockCid)

      expect(result.data).toEqual(mockData)
      expect(result.gateway).toBe('synapse')
      expect(result.size).toBe(5)
      expect(downloadFromSynapse).toHaveBeenCalledWith(mockCid)
    })

    it('should retry on failure', async () => {
      ;(downloadFromSynapse as jest.Mock)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(mockData)

      const result = await fetchFromIpfs(mockCid, { retries: 3 })

      expect(result.data).toEqual(mockData)
      expect(downloadFromSynapse).toHaveBeenCalledTimes(3)
    })

    it('should throw after all retries fail', async () => {
      ;(downloadFromSynapse as jest.Mock).mockRejectedValue(new Error('Network error'))

      await expect(fetchFromIpfs(mockCid, { retries: 2 })).rejects.toThrow(
        'Failed to fetch via Synapse'
      )
      expect(downloadFromSynapse).toHaveBeenCalledTimes(2)
    })

    it('should handle abort signal', async () => {
      const abortController = new AbortController()
      abortController.abort()

      await expect(
        fetchFromIpfs(mockCid, { abortSignal: abortController.signal })
      ).rejects.toThrow('Fetch aborted')
    })

    it('should call progress callback', async () => {
      const onProgress = jest.fn()
      ;(downloadFromSynapse as jest.Mock).mockResolvedValueOnce(mockData)

      await fetchFromIpfs(mockCid, { onProgress })

      expect(onProgress).toHaveBeenCalledWith(5, 5)
    })
  })

  describe('streamFromIpfs', () => {
    const mockCid = 'QmTestCid123456789'
    const mockData = new Uint8Array([1, 2, 3, 4, 5])
    
    it('should return readable stream', async () => {
      ;(downloadFromSynapse as jest.Mock).mockResolvedValueOnce(mockData)

      const result = await streamFromIpfs(mockCid)

      expect(result.stream).toBeDefined()
      expect(result.gateway).toBe('synapse')
      expect(result.contentLength).toBe(5)
    })

    it('should throw for invalid CID', async () => {
      await expect(streamFromIpfs('')).rejects.toThrow(IpfsError)
    })
  })

  describe('fetchEncryptedData', () => {
    it('should fetch via Synapse with encrypted defaults', async () => {
      ;(downloadFromSynapse as jest.Mock).mockResolvedValueOnce(new Uint8Array([1]))

      await fetchEncryptedData('QmTest')

      expect(downloadFromSynapse).toHaveBeenCalled()
    })
  })

  describe('fetchMultiple', () => {
    it('should fetch multiple CIDs with concurrency limit', async () => {
      ;(downloadFromSynapse as jest.Mock).mockResolvedValue(new Uint8Array([1]))

      const cids = ['QmAbc123', 'QmBcd234', 'QmCde345']
      const results = await fetchMultiple(cids, {}, 2)

      expect(results).toHaveLength(3)
      expect(results.every(r => r !== null)).toBe(true)
    })

    it('should handle individual fetch failures', async () => {
      ;(downloadFromSynapse as jest.Mock)
        .mockResolvedValueOnce(new Uint8Array([1]))
        .mockRejectedValue(new Error('Failed'))

      const cids = ['QmAbc123', 'invalid-cid-that-will-fail']
      const results = await fetchMultiple(cids, {}, 1)

      expect(results[0]).not.toBeNull()
      expect(results[1]).toBeNull()
    })
  })
})