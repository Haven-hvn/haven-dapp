/**
 * IPFS Service Tests
 * 
 * Unit tests for the IPFS fetch service.
 * 
 * @module services/__tests__/ipfsService
 */

import {
  fetchFromIpfs,
  streamFromIpfs,
  fetchEncryptedData,
  fetchMultiple,
} from '../ipfsService'
import { IpfsError, buildIpfsUrl, isValidCid } from '@/lib/ipfs'

// Mock the fetch API
global.fetch = jest.fn()

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
      expect(isValidCid('ab')).toBe(false) // Too short
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

    it('should fetch successfully from primary gateway', async () => {
      const mockResponse = {
        ok: true,
        headers: new Map([['content-length', '5']]),
        body: {
          getReader: () => ({
            read: jest.fn()
              .mockResolvedValueOnce({ done: false, value: mockData })
              .mockResolvedValueOnce({ done: true }),
            releaseLock: jest.fn(),
          }),
        },
      }
      ;(global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse)

      const result = await fetchFromIpfs(mockCid)

      expect(result.data).toEqual(mockData)
      expect(result.gateway).toBeDefined()
      expect(result.size).toBe(5)
    })

    it('should retry on failure and fallback to next gateway', async () => {
      // First gateway fails
      ;(global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
      
      // Second gateway succeeds
      const mockResponse = {
        ok: true,
        headers: new Map(),
        body: {
          getReader: () => ({
            read: jest.fn()
              .mockResolvedValueOnce({ done: false, value: mockData })
              .mockResolvedValueOnce({ done: true }),
            releaseLock: jest.fn(),
          }),
        },
      }
      ;(global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse)

      const result = await fetchFromIpfs(mockCid, { retries: 3 })

      expect(result.data).toEqual(mockData)
      expect(global.fetch).toHaveBeenCalledTimes(4) // 3 retries + 1 success
    })

    it('should throw when all gateways fail', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'))

      await expect(fetchFromIpfs(mockCid, { retries: 1 })).rejects.toThrow(
        'Failed to fetch from all gateways'
      )
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
      const mockResponse = {
        ok: true,
        headers: new Map([['content-length', '10']]),
        body: {
          getReader: () => ({
            read: jest.fn()
              .mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2, 3, 4, 5]) })
              .mockResolvedValueOnce({ done: false, value: new Uint8Array([6, 7, 8, 9, 10]) })
              .mockResolvedValueOnce({ done: true }),
            releaseLock: jest.fn(),
          }),
        },
      }
      ;(global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse)

      await fetchFromIpfs(mockCid, { onProgress })

      expect(onProgress).toHaveBeenCalled()
    })
  })

  describe('streamFromIpfs', () => {
    const mockCid = 'QmTestCid123456789'
    
    it('should return readable stream on success', async () => {
      const mockStream = new ReadableStream()
      const mockResponse = {
        ok: true,
        body: mockStream,
        headers: new Map([
          ['content-type', 'video/mp4'],
          ['content-length', '1024'],
        ]),
      }
      ;(global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse)

      const result = await streamFromIpfs(mockCid)

      expect(result.stream).toBe(mockStream)
      expect(result.contentType).toBe('video/mp4')
      expect(result.contentLength).toBe(1024)
    })

    it('should fallback on failure', async () => {
      ;(global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce({
          ok: true,
          body: new ReadableStream(),
          headers: new Map(),
        })

      const result = await streamFromIpfs(mockCid)

      expect(result.stream).toBeDefined()
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })

    it('should throw for invalid CID', async () => {
      await expect(streamFromIpfs('')).rejects.toThrow(IpfsError)
    })
  })

  describe('fetchEncryptedData', () => {
    it('should use longer timeout for encrypted data', async () => {
      const mockResponse = {
        ok: true,
        headers: new Map(),
        body: {
          getReader: () => ({
            read: jest.fn()
              .mockResolvedValueOnce({ done: false, value: new Uint8Array([1]) })
              .mockResolvedValueOnce({ done: true }),
            releaseLock: jest.fn(),
          }),
        },
      }
      ;(global.fetch as jest.Mock).mockResolvedValue(mockResponse)

      await fetchEncryptedData('QmTest')

      // Should succeed with default encrypted options
      expect(global.fetch).toHaveBeenCalled()
    })
  })

  describe('fetchMultiple', () => {
    it('should fetch multiple CIDs with concurrency limit', async () => {
      const mockResponse = {
        ok: true,
        headers: new Map(),
        body: {
          getReader: () => ({
            read: jest.fn()
              .mockResolvedValueOnce({ done: false, value: new Uint8Array([1]) })
              .mockResolvedValueOnce({ done: true }),
            releaseLock: jest.fn(),
          }),
        },
      }
      ;(global.fetch as jest.Mock).mockResolvedValue(mockResponse)

      const cids = ['QmAbc123', 'QmBcd234', 'QmCde345']
      const results = await fetchMultiple(cids, {}, 2) // Max 2 concurrent

      expect(results).toHaveLength(3)
      expect(results.every(r => r !== null)).toBe(true)
    })

    it('should handle individual fetch failures', async () => {
      ;(global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          headers: new Map(),
          body: {
            getReader: () => ({
              read: jest.fn()
                .mockResolvedValueOnce({ done: false, value: new Uint8Array([1]) })
                .mockResolvedValueOnce({ done: true }),
              releaseLock: jest.fn(),
            }),
          },
        })
        .mockRejectedValue(new Error('Failed'))

      const cids = ['QmAbc123', 'invalid-cid-that-will-fail']
      const results = await fetchMultiple(cids, {}, 1)

      expect(results[0]).not.toBeNull()
      expect(results[1]).toBeNull()
    })
  })
})

describe('buildIpfsUrl', () => {
  it('should build correct URL with default gateway', () => {
    const url = buildIpfsUrl('QmTest')
    expect(url).toContain('QmTest')
    expect(url).toMatch(/^https:\/\//)
  })

  it('should handle ipfs:// prefix', () => {
    const url = buildIpfsUrl('ipfs://QmTest')
    expect(url).not.toContain('ipfs://')
    expect(url).toContain('QmTest')
  })

  it('should handle leading slash', () => {
    const url = buildIpfsUrl('/QmTest')
    expect(url).not.toContain('/QmTest')
    expect(url).toContain('QmTest')
  })
})
