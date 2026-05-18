/**
 * Content Retrieval Service Tests
 *
 * @module services/__tests__/ipfsService
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  fetchPieceFromSynapse,
  fetchPinnedContent,
  streamFromIpfs,
  fetchEncryptedData,
  fetchMultiple,
} from '../ipfsService'
import type { Video } from '@/types/video'
import { IpfsError } from '@/lib/ipfs'

vi.mock('@/lib/synapse', () => ({
  downloadFromSynapse: vi.fn(),
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

const PIECE =
  'bafkzcibe2hzbcd4t6clvsb3mfrezyxl75gl3gzcsqi42dd27gktq4nk75rr62ciuaq'

const OWNER = '0xb24ca10fb6907a2d94b0dc5dbea6b5e379d19ffd'

function testVideo(overrides: Partial<Video> = {}): Video {
  return {
    id: '0x1',
    owner: OWNER,
    title: 'Test',
    duration: 60,
    createdAt: new Date(),
    isEncrypted: true,
    hasAiData: false,
    pieceCid: PIECE,
    ...overrides,
  }
}

Object.defineProperty(global, 'performance', {
  value: {
    now: vi.fn(() => 0),
  },
  writable: true,
})

describe('ipfsService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('fetchPieceFromSynapse', () => {
    const mockData = new Uint8Array([1, 2, 3, 4, 5])

    it('should throw IpfsError for invalid piece CID', async () => {
      await expect(fetchPieceFromSynapse('')).rejects.toThrow(IpfsError)
      await expect(fetchPieceFromSynapse('bafybeifoo')).rejects.toThrow(/Expected Filecoin piece CID/)
    })

    it('should fetch successfully from Synapse SDK', async () => {
      vi.mocked(downloadFromSynapse).mockResolvedValueOnce(mockData)

      const result = await fetchPieceFromSynapse(PIECE)

      expect(result.data).toEqual(mockData)
      expect(result.gateway).toBe('synapse')
      expect(result.size).toBe(5)
      expect(downloadFromSynapse).toHaveBeenCalledWith(
        PIECE,
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      )
    })

    it('should pass catalogOwner to downloadFromSynapse', async () => {
      vi.mocked(downloadFromSynapse).mockResolvedValueOnce(mockData)

      await fetchPieceFromSynapse(PIECE, { catalogOwner: OWNER })

      expect(downloadFromSynapse).toHaveBeenCalledWith(
        PIECE,
        expect.objectContaining({
          catalogOwner: OWNER,
          signal: expect.any(AbortSignal),
        })
      )
    })

    it('should retry on failure', async () => {
      vi.mocked(downloadFromSynapse)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(mockData)

      const result = await fetchPieceFromSynapse(PIECE, { retries: 3 })

      expect(result.data).toEqual(mockData)
      expect(downloadFromSynapse).toHaveBeenCalledTimes(3)
    })

    it('should throw after all retries fail', async () => {
      vi.mocked(downloadFromSynapse).mockRejectedValue(new Error('Network error'))

      await expect(fetchPieceFromSynapse(PIECE, { retries: 2 })).rejects.toThrow(
        'Failed to fetch via Synapse'
      )
      expect(downloadFromSynapse).toHaveBeenCalledTimes(2)
    })

    it('should handle abort signal', async () => {
      const abortController = new AbortController()
      abortController.abort()

      await expect(
        fetchPieceFromSynapse(PIECE, { abortSignal: abortController.signal })
      ).rejects.toThrow('Fetch aborted')
    })

    it('should call progress callback', async () => {
      const onProgress = vi.fn()
      vi.mocked(downloadFromSynapse).mockResolvedValueOnce(mockData)

      await fetchPieceFromSynapse(PIECE, { onProgress })

      expect(onProgress).toHaveBeenCalledWith(5, 5)
    })
  })

  describe('streamFromIpfs', () => {
    const mockData = new Uint8Array([1, 2, 3, 4, 5])

    it('should return readable stream', async () => {
      vi.mocked(downloadFromSynapse).mockResolvedValueOnce(mockData)

      const result = await streamFromIpfs(PIECE)

      expect(result.stream).toBeDefined()
      expect(result.gateway).toBe('synapse')
      expect(result.contentLength).toBe(5)
    })

    it('should throw for invalid piece CID', async () => {
      await expect(streamFromIpfs('')).rejects.toThrow(IpfsError)
    })
  })

  describe('fetchPinnedContent', () => {
    const mockData = new Uint8Array([1, 2, 3])

    it('should pass video owner as catalogOwner', async () => {
      vi.mocked(downloadFromSynapse).mockResolvedValueOnce(mockData)

      await fetchPinnedContent(testVideo())

      expect(downloadFromSynapse).toHaveBeenCalledWith(
        PIECE,
        expect.objectContaining({
          catalogOwner: OWNER,
          signal: expect.any(AbortSignal),
        })
      )
    })
  })

  describe('fetchEncryptedData', () => {
    it('should fetch via Synapse with encrypted defaults', async () => {
      vi.mocked(downloadFromSynapse).mockResolvedValueOnce(new Uint8Array([1]))

      await fetchEncryptedData(PIECE)

      expect(downloadFromSynapse).toHaveBeenCalledWith(
        PIECE,
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      )
    })
  })

  describe('fetchMultiple', () => {
    it('should fetch multiple piece CIDs with concurrency limit', async () => {
      vi.mocked(downloadFromSynapse).mockResolvedValue(new Uint8Array([1]))

      const pieceCids = [PIECE, PIECE, PIECE]
      const results = await fetchMultiple(pieceCids, {}, 2)

      expect(results).toHaveLength(3)
      expect(results.every(r => r !== null)).toBe(true)
    })

    it('should handle individual fetch failures', async () => {
      vi.mocked(downloadFromSynapse)
        .mockResolvedValueOnce(new Uint8Array([1]))
        .mockRejectedValue(new Error('Failed'))

      const results = await fetchMultiple([PIECE, 'bafyinvalidroot'], {}, 1)

      expect(results[0]).not.toBeNull()
      expect(results[1]).toBeNull()
    })
  })
})
