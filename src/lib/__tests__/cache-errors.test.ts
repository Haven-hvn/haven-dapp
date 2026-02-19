/**
 * Cache Error Logging Tests
 *
 * Tests for the cache error logging and reporting system.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  logCacheError,
  getCacheErrors,
  getRecentCacheErrors,
  clearCacheErrors,
  getCacheErrorCounts,
  hasCacheError,
  isQuotaExceededError,
  isCorruptionError,
  classifyCacheApiError,
} from '../cache-errors'

describe('Cache Error Logging', () => {
  beforeEach(() => {
    clearCacheErrors()
  })

  describe('logCacheError', () => {
    it('logs a cache error', () => {
      logCacheError({
        code: 'CACHE_WRITE_FAILED',
        message: 'Failed to write to cache',
      })

      const errors = getCacheErrors()
      expect(errors).toHaveLength(1)
      expect(errors[0].code).toBe('CACHE_WRITE_FAILED')
      expect(errors[0].message).toBe('Failed to write to cache')
      expect(errors[0].timestamp).toBeInstanceOf(Date)
    })

    it('logs error with videoId', () => {
      logCacheError({
        code: 'QUOTA_EXCEEDED',
        message: 'Storage full',
        videoId: '0x123',
      })

      const errors = getCacheErrors()
      expect(errors[0].videoId).toBe('0x123')
    })

    it('logs error with context', () => {
      logCacheError({
        code: 'CACHE_WRITE_FAILED',
        message: 'Failed',
        context: { size: 1024 },
      })

      const errors = getCacheErrors()
      expect(errors[0].context).toEqual({ size: 1024 })
    })

    it('limits log to 50 entries', () => {
      for (let i = 0; i < 60; i++) {
        logCacheError({
          code: 'CACHE_WRITE_FAILED',
          message: `Error ${i}`,
        })
      }

      const errors = getCacheErrors()
      expect(errors).toHaveLength(50)
      expect(errors[0].message).toBe('Error 10') // Oldest entries removed
      expect(errors[49].message).toBe('Error 59') // Newest kept
    })
  })

  describe('getCacheErrors', () => {
    it('returns empty array when no errors', () => {
      expect(getCacheErrors()).toEqual([])
    })

    it('returns copy of error log', () => {
      logCacheError({ code: 'CACHE_WRITE_FAILED', message: 'Error' })

      const errors = getCacheErrors()
      errors.pop() // Modify the copy

      expect(getCacheErrors()).toHaveLength(1) // Original unchanged
    })
  })

  describe('getRecentCacheErrors', () => {
    it('returns errors after specified time', () => {
      const before = new Date()

      logCacheError({ code: 'CACHE_WRITE_FAILED', message: 'Old' })
      logCacheError({ code: 'CACHE_WRITE_FAILED', message: 'New' })

      const after = new Date()

      const recent = getRecentCacheErrors(after)
      expect(recent).toHaveLength(0) // No errors after 'after'

      const all = getRecentCacheErrors(before)
      expect(all).toHaveLength(2)
    })
  })

  describe('clearCacheErrors', () => {
    it('clears all errors', () => {
      logCacheError({ code: 'CACHE_WRITE_FAILED', message: 'Error' })
      expect(getCacheErrors()).toHaveLength(1)

      clearCacheErrors()
      expect(getCacheErrors()).toHaveLength(0)
    })
  })

  describe('getCacheErrorCounts', () => {
    it('counts errors by code', () => {
      logCacheError({ code: 'QUOTA_EXCEEDED', message: 'Full' })
      logCacheError({ code: 'QUOTA_EXCEEDED', message: 'Full again' })
      logCacheError({ code: 'CACHE_WRITE_FAILED', message: 'Write failed' })

      const counts = getCacheErrorCounts()
      expect(counts.get('QUOTA_EXCEEDED')).toBe(2)
      expect(counts.get('CACHE_WRITE_FAILED')).toBe(1)
    })
  })

  describe('hasCacheError', () => {
    it('returns true when error exists', () => {
      logCacheError({ code: 'QUOTA_EXCEEDED', message: 'Full' })
      expect(hasCacheError('QUOTA_EXCEEDED')).toBe(true)
    })

    it('returns false when error does not exist', () => {
      logCacheError({ code: 'CACHE_WRITE_FAILED', message: 'Failed' })
      expect(hasCacheError('QUOTA_EXCEEDED')).toBe(false)
    })
  })

  describe('isQuotaExceededError', () => {
    it('detects QuotaExceededError DOMException', () => {
      const error = new DOMException('Quota exceeded', 'QuotaExceededError')
      expect(isQuotaExceededError(error)).toBe(true)
    })

    it('detects quota message in Error', () => {
      const error = new Error('Storage quota exceeded')
      expect(isQuotaExceededError(error)).toBe(true)
    })

    it('returns false for non-quota errors', () => {
      const error = new Error('Network error')
      expect(isQuotaExceededError(error)).toBe(false)
    })

    it('returns false for non-errors', () => {
      expect(isQuotaExceededError('string')).toBe(false)
      expect(isQuotaExceededError(null)).toBe(false)
      expect(isQuotaExceededError(123)).toBe(false)
    })
  })

  describe('isCorruptionError', () => {
    it('detects InvalidStateError', () => {
      const error = new DOMException('Invalid state', 'InvalidStateError')
      expect(isCorruptionError(error)).toBe(true)
    })

    it('detects DataError', () => {
      const error = new DOMException('Data error', 'DataError')
      expect(isCorruptionError(error)).toBe(true)
    })

    it('detects corruption message', () => {
      const error = new Error('Database corrupted')
      expect(isCorruptionError(error)).toBe(true)
    })

    it('returns false for non-corruption errors', () => {
      const error = new Error('Network error')
      expect(isCorruptionError(error)).toBe(false)
    })
  })

  describe('classifyCacheApiError', () => {
    it('classifies quota errors', () => {
      const error = new DOMException('Quota exceeded', 'QuotaExceededError')
      expect(classifyCacheApiError(error)).toBe('QUOTA_EXCEEDED')
    })

    it('classifies corruption errors', () => {
      const error = new DOMException('Invalid state', 'InvalidStateError')
      expect(classifyCacheApiError(error)).toBe('CACHE_CORRUPTED')
    })

    it('classifies read errors', () => {
      const error = new Error('Failed to read from cache')
      expect(classifyCacheApiError(error)).toBe('CACHE_READ_FAILED')
    })

    it('classifies write errors', () => {
      const error = new Error('Failed to write to cache')
      expect(classifyCacheApiError(error)).toBe('CACHE_WRITE_FAILED')
    })

    it('classifies integrity errors', () => {
      const error = new Error('Integrity check failed')
      expect(classifyCacheApiError(error)).toBe('INTEGRITY_CHECK_FAILED')
    })

    it('uses default for unknown errors', () => {
      const error = new Error('Unknown')
      expect(classifyCacheApiError(error)).toBe('CACHE_WRITE_FAILED')
      expect(classifyCacheApiError(error, 'CACHE_READ_FAILED')).toBe('CACHE_READ_FAILED')
    })
  })
})
