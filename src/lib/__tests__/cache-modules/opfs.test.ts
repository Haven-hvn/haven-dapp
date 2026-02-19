/**
 * Unit tests for opfs.ts
 * 
 * Tests for the Origin Private File System (OPFS) staging utilities.
 */

import {
  isOpfsAvailable,
  writeToStaging,
  readFromStaging,
  deleteStaging,
  clearAllStaging,
  hasStagingFile,
  getStagingSize,
  listStagedVideos,
  getTotalStagingSize,
  OpfsError,
} from '../../opfs'
import { setupOpfsMock, resetOpfsMock, teardownOpfsMock } from './mocks/opfs'

// Helper to create a readable stream from Uint8Array
function createReadableStream(data: Uint8Array[]): ReadableStream<Uint8Array> {
  let index = 0
  return new ReadableStream({
    pull(controller) {
      if (index < data.length) {
        controller.enqueue(data[index])
        index++
      } else {
        controller.close()
      }
    },
  })
}

describe('opfs', () => {
  beforeAll(() => {
    setupOpfsMock()
  })

  beforeEach(() => {
    resetOpfsMock()
  })

  afterAll(() => {
    teardownOpfsMock()
  })

  describe('isOpfsAvailable', () => {
    it('returns true when OPFS is supported', () => {
      expect(isOpfsAvailable()).toBe(true)
    })

    it('returns false in SSR context', () => {
      const originalNavigator = (global as any).navigator
      ;(global as any).navigator = undefined

      expect(isOpfsAvailable()).toBe(false)

      ;(global as any).navigator = originalNavigator
    })

    it('returns false when storage.getDirectory is not available', () => {
      const originalNavigator = (global as any).navigator
      ;(global as any).navigator = { storage: {} }

      expect(isOpfsAvailable()).toBe(false)

      ;(global as any).navigator = originalNavigator
    })
  })

  describe('writeToStaging', () => {
    it('writes stream data to OPFS file', async () => {
      const videoId = 'write-test'
      const data = new Uint8Array([1, 2, 3, 4, 5])
      const stream = createReadableStream([data])

      const bytesWritten = await writeToStaging(videoId, stream)

      expect(bytesWritten).toBe(5)
      expect(await hasStagingFile(videoId)).toBe(true)
    })

    it('writes large data in chunks', async () => {
      const videoId = 'large-write-test'
      const chunk1 = new Uint8Array(new Array(100).fill(1))
      const chunk2 = new Uint8Array(new Array(200).fill(2))
      const stream = createReadableStream([chunk1, chunk2])

      const bytesWritten = await writeToStaging(videoId, stream)

      expect(bytesWritten).toBe(300)
    })

    it('reports progress via callback', async () => {
      const videoId = 'progress-test'
      const progressValues: number[] = []
      const chunk1 = new Uint8Array(new Array(100).fill(1))
      const chunk2 = new Uint8Array(new Array(100).fill(2))
      const stream = createReadableStream([chunk1, chunk2])

      await writeToStaging(videoId, stream, (bytes) => {
        progressValues.push(bytes)
      })

      expect(progressValues).toEqual([100, 200])
    })

    it('returns total bytes written', async () => {
      const videoId = 'bytes-written-test'
      const data = new Uint8Array(new Array(500).fill(0))
      const stream = createReadableStream([data])

      const result = await writeToStaging(videoId, stream)

      expect(result).toBe(500)
    })

    it('throws OpfsError when OPFS is not available', async () => {
      const originalNavigator = (global as any).navigator
      ;(global as any).navigator = { storage: {} }

      const stream = createReadableStream([new Uint8Array([1])])

      await expect(writeToStaging('test', stream)).rejects.toThrow(OpfsError)

      ;(global as any).navigator = originalNavigator
    })

    it('throws OpfsError with FILE_CREATE_ERROR code on file creation failure', async () => {
      // Mock getDirectory to throw
      const originalGetDirectory = (global as any).navigator.storage.getDirectory
      ;(global as any).navigator.storage.getDirectory = jest.fn().mockRejectedValue(new Error('Access denied'))

      const stream = createReadableStream([new Uint8Array([1])])

      await expect(writeToStaging('test', stream)).rejects.toThrow(OpfsError)

      ;(global as any).navigator.storage.getDirectory = originalGetDirectory
    })
  })

  describe('readFromStaging', () => {
    it('reads staged data back as Uint8Array', async () => {
      const videoId = 'read-test'
      const originalData = new Uint8Array([10, 20, 30, 40, 50])
      const stream = createReadableStream([originalData])
      await writeToStaging(videoId, stream)

      const readData = await readFromStaging(videoId)

      expect(readData).toEqual(originalData)
    })

    it('reads large files correctly', async () => {
      const videoId = 'large-read-test'
      const originalData = new Uint8Array(new Array(1000).fill(0).map((_, i) => i % 256))
      const stream = createReadableStream([originalData])
      await writeToStaging(videoId, stream)

      const readData = await readFromStaging(videoId)

      expect(readData).toEqual(originalData)
      expect(readData.byteLength).toBe(1000)
    })

    it('throws OpfsError when file does not exist', async () => {
      await expect(readFromStaging('non-existent-file')).rejects.toThrow(OpfsError)
    })

    it('throws OpfsError with FILE_NOT_FOUND code for missing file', async () => {
      try {
        await readFromStaging('missing-file')
        fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(OpfsError)
        expect((error as OpfsError).code).toBe('FILE_NOT_FOUND')
      }
    })

    it('throws OpfsError when OPFS is not available', async () => {
      const originalNavigator = (global as any).navigator
      ;(global as any).navigator = { storage: {} }

      await expect(readFromStaging('test')).rejects.toThrow(OpfsError)

      ;(global as any).navigator = originalNavigator
    })
  })

  describe('deleteStaging', () => {
    it('removes staging file', async () => {
      const videoId = 'delete-test'
      const stream = createReadableStream([new Uint8Array([1, 2, 3])])
      await writeToStaging(videoId, stream)
      expect(await hasStagingFile(videoId)).toBe(true)

      await deleteStaging(videoId)

      expect(await hasStagingFile(videoId)).toBe(false)
    })

    it('does not throw when file does not exist', async () => {
      await expect(deleteStaging('non-existent')).resolves.not.toThrow()
    })

    it('handles OPFS not available gracefully', async () => {
      const originalNavigator = (global as any).navigator
      ;(global as any).navigator = { storage: {} }

      // Should not throw even when OPFS is unavailable
      await expect(deleteStaging('test')).resolves.not.toThrow()

      ;(global as any).navigator = originalNavigator
    })
  })

  describe('clearAllStaging', () => {
    it('removes all staging files', async () => {
      // Write multiple files
      await writeToStaging('clear-1', createReadableStream([new Uint8Array([1])]))
      await writeToStaging('clear-2', createReadableStream([new Uint8Array([2])]))
      await writeToStaging('clear-3', createReadableStream([new Uint8Array([3])]))

      expect(await hasStagingFile('clear-1')).toBe(true)
      expect(await hasStagingFile('clear-2')).toBe(true)
      expect(await hasStagingFile('clear-3')).toBe(true)

      await clearAllStaging()

      // After clearing, files should be gone
      // Note: hasStagingFile returns false if OPFS root directory doesn't exist
      // which happens after clearAllStaging removes the staging directory
      expect(await hasStagingFile('clear-1')).toBe(false)
      expect(await hasStagingFile('clear-2')).toBe(false)
      expect(await hasStagingFile('clear-3')).toBe(false)
    })

    it('handles OPFS not available gracefully', async () => {
      const originalNavigator = (global as any).navigator
      ;(global as any).navigator = { storage: {} }

      await expect(clearAllStaging()).resolves.not.toThrow()

      ;(global as any).navigator = originalNavigator
    })

    it('succeeds when staging directory does not exist', async () => {
      // Ensure staging directory doesn't exist by clearing once
      await clearAllStaging()
      
      // Second clear should succeed without error
      await expect(clearAllStaging()).resolves.not.toThrow()
    })
  })

  describe('hasStagingFile', () => {
    it('returns true when file exists', async () => {
      const videoId = 'exists-test'
      await writeToStaging(videoId, createReadableStream([new Uint8Array([1])]))

      expect(await hasStagingFile(videoId)).toBe(true)
    })

    it('returns false when file does not exist', async () => {
      expect(await hasStagingFile('does-not-exist')).toBe(false)
    })

    it('returns false when OPFS is not available', async () => {
      const originalNavigator = (global as any).navigator
      ;(global as any).navigator = { storage: {} }

      expect(await hasStagingFile('test')).toBe(false)

      ;(global as any).navigator = originalNavigator
    })
  })

  describe('getStagingSize', () => {
    it('returns correct size of staging file', async () => {
      const videoId = 'size-test'
      const data = new Uint8Array(new Array(500).fill(0))
      await writeToStaging(videoId, createReadableStream([data]))

      const size = await getStagingSize(videoId)

      expect(size).toBe(500)
    })

    it('returns 0 when file does not exist', async () => {
      const size = await getStagingSize('non-existent')
      expect(size).toBe(0)
    })

    it('returns 0 when OPFS is not available', async () => {
      const originalNavigator = (global as any).navigator
      ;(global as any).navigator = { storage: {} }

      expect(await getStagingSize('test')).toBe(0)

      ;(global as any).navigator = originalNavigator
    })
  })

  describe('listStagedVideos', () => {
    it('returns empty array when no videos staged', async () => {
      const videos = await listStagedVideos()
      expect(videos).toEqual([])
    })

    it('returns all staged video IDs', async () => {
      await writeToStaging('list-1', createReadableStream([new Uint8Array([1])]))
      await writeToStaging('list-2', createReadableStream([new Uint8Array([2])]))
      await writeToStaging('list-3', createReadableStream([new Uint8Array([3])]))

      const videos = await listStagedVideos()

      expect(videos).toHaveLength(3)
      expect(videos).toContain('list-1')
      expect(videos).toContain('list-2')
      expect(videos).toContain('list-3')
    })

    it('returns empty array when OPFS is not available', async () => {
      const originalNavigator = (global as any).navigator
      ;(global as any).navigator = { storage: {} }

      const videos = await listStagedVideos()
      expect(videos).toEqual([])

      ;(global as any).navigator = originalNavigator
    })
  })

  describe('getTotalStagingSize', () => {
    it('returns total size of all staging files', async () => {
      await writeToStaging('total-1', createReadableStream([new Uint8Array(100)]))
      await writeToStaging('total-2', createReadableStream([new Uint8Array(200)]))
      await writeToStaging('total-3', createReadableStream([new Uint8Array(300)]))

      const total = await getTotalStagingSize()

      expect(total).toBe(600)
    })

    it('returns 0 when no files staged', async () => {
      await clearAllStaging()
      const total = await getTotalStagingSize()
      expect(total).toBe(0)
    })

    it('returns 0 when OPFS is not available', async () => {
      const originalNavigator = (global as any).navigator
      ;(global as any).navigator = { storage: {} }

      expect(await getTotalStagingSize()).toBe(0)

      ;(global as any).navigator = originalNavigator
    })
  })

  describe('OpfsError', () => {
    it('creates error with correct properties', () => {
      const error = new OpfsError('Test message', 'TEST_CODE', 'video-123')

      expect(error.message).toBe('Test message')
      expect(error.code).toBe('TEST_CODE')
      expect(error.videoId).toBe('video-123')
      expect(error.name).toBe('OpfsError')
    })

    it('works without videoId', () => {
      const error = new OpfsError('No video', 'GENERIC_ERROR')

      expect(error.message).toBe('No video')
      expect(error.code).toBe('GENERIC_ERROR')
      expect(error.videoId).toBeUndefined()
    })
  })
})
