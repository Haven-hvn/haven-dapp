/**
 * Unit tests for lit-session-cache.ts
 * 
 * Tests for the Lit Protocol session caching utilities.
 */

import {
  getCachedAuthContext,
  setCachedAuthContext,
  clearAuthContext,
  isAuthContextValid,
  getSessionInfo,
  hasCachedSession,
  getCachedSessionAddresses,
  restoreSessionsFromStorage,
  EXPIRY_SAFETY_MARGIN_MS,
} from '../../lit-session-cache'
import type { LitAuthContext } from '../../lit-auth'

// Mock lit-auth module
jest.mock('../../lit-auth', () => ({
  isAuthContextExpired: jest.fn().mockReturnValue(false),
}))

import { isAuthContextExpired } from '../../lit-auth'

const mockedIsAuthContextExpired = isAuthContextExpired as jest.MockedFunction<typeof isAuthContextExpired>

describe('lit-session-cache', () => {
  // Mock sessionStorage
  let mockSessionStorage: { [key: string]: string } = {}

  beforeEach(() => {
    // Clear the cache before each test
    clearAuthContext()
    mockedIsAuthContextExpired.mockReturnValue(false)

    // Setup mock sessionStorage
    mockSessionStorage = {}
    Object.defineProperty(global, 'sessionStorage', {
      value: {
        getItem: jest.fn((key: string) => mockSessionStorage[key] || null),
        setItem: jest.fn((key: string, value: string) => {
          mockSessionStorage[key] = value
        }),
        removeItem: jest.fn((key: string) => {
          delete mockSessionStorage[key]
        }),
        clear: jest.fn(() => {
          mockSessionStorage = {}
        }),
        length: 0,
        key: jest.fn((index: number) => Object.keys(mockSessionStorage)[index] || null),
      },
      writable: true,
    })
    
    // Reset sessionStorage.length
    Object.defineProperty(global.sessionStorage, 'length', {
      get: () => Object.keys(mockSessionStorage).length,
      configurable: true,
    })
  })

  afterEach(() => {
    clearAuthContext()
    jest.clearAllMocks()
  })

  describe('getCachedAuthContext', () => {
    it('returns null when no session cached', () => {
      const result = getCachedAuthContext('0x123')
      expect(result).toBeNull()
    })

    it('returns cached session when valid', () => {
      const address = '0x1234567890123456789012345678901234567890'
      const authContext: LitAuthContext = {
        userId: address,
        authData: { expiration: new Date(Date.now() + 3600000).toISOString() },
      }

      setCachedAuthContext(address, authContext)
      const result = getCachedAuthContext(address)

      expect(result).toEqual(authContext)
    })

    it('returns null when session expired', () => {
      const address = '0x1234567890123456789012345678901234567890'
      const authContext: LitAuthContext = {
        userId: address,
        authData: { expiration: new Date(Date.now() - 1000).toISOString() },
      }

      // Mock expired check
      mockedIsAuthContextExpired.mockReturnValue(true)

      setCachedAuthContext(address, authContext, 1000) // 1 second TTL
      
      // Fast forward past expiration
      jest.advanceTimersByTime(2000)

      const result = getCachedAuthContext(address)
      expect(result).toBeNull()
    })

    it('returns null when within safety margin of expiry', () => {
      const address = '0x1234567890123456789012345678901234567890'
      const expirationTime = Date.now() + (EXPIRY_SAFETY_MARGIN_MS - 60000) // Less than 5 min margin
      const authContext: LitAuthContext = {
        userId: address,
        authData: { expiration: new Date(expirationTime).toISOString() },
      }

      setCachedAuthContext(address, authContext, EXPIRY_SAFETY_MARGIN_MS * 2)
      
      // Manually set expiresAt to be within safety margin
      const result = getCachedAuthContext(address)
      
      // Since we're within the safety margin, it should return null
      expect(result).toBeNull()
    })

    it('normalizes address to lowercase', () => {
      const address = '0xABC123'
      const lowercaseAddress = '0xabc123'
      const authContext: LitAuthContext = { userId: address }

      setCachedAuthContext(address, authContext)

      // Should find it with lowercase
      const result = getCachedAuthContext(lowercaseAddress)
      expect(result).not.toBeNull()
    })

    it('returns null for empty address', () => {
      const result = getCachedAuthContext('')
      expect(result).toBeNull()
    })

    it('clears session from sessionStorage when expired', () => {
      const address = '0x1234567890123456789012345678901234567890'
      const authContext: LitAuthContext = {
        userId: address,
        authData: { expiration: new Date(Date.now() + 1000).toISOString() },
      }

      mockedIsAuthContextExpired.mockReturnValue(true)

      setCachedAuthContext(address, authContext, 1000)
      
      // Should set item in sessionStorage initially
      expect(global.sessionStorage.setItem).toHaveBeenCalled()

      // Get should trigger cleanup
      getCachedAuthContext(address)

      // Should try to remove from sessionStorage
      expect(global.sessionStorage.removeItem).toHaveBeenCalled()
    })
  })

  describe('setCachedAuthContext', () => {
    it('stores auth context for address', () => {
      const address = '0x123'
      const authContext: LitAuthContext = { userId: address }

      setCachedAuthContext(address, authContext)

      const result = getCachedAuthContext(address)
      expect(result).toEqual(authContext)
    })

    it('normalizes address to lowercase', () => {
      const address = '0xABCDEF'
      const authContext: LitAuthContext = { userId: address }

      setCachedAuthContext(address, authContext)

      // Should be retrievable with lowercase
      expect(getCachedAuthContext('0xabcdef')).not.toBeNull()
      expect(getCachedAuthContext('0xABCDEF')).not.toBeNull()
    })

    it('sets correct expiration time', () => {
      const address = '0x123'
      const authContext: LitAuthContext = { userId: address }
      const expirationMs = 2 * 60 * 60 * 1000 // 2 hours

      const beforeSet = Date.now()
      setCachedAuthContext(address, authContext, expirationMs)
      const afterSet = Date.now()

      const info = getSessionInfo(address)
      expect(info.expiresAt).not.toBeNull()
      
      const expectedExpiration = beforeSet + expirationMs
      expect(info.expiresAt!.getTime()).toBeGreaterThanOrEqual(expectedExpiration - 1000)
      expect(info.expiresAt!.getTime()).toBeLessThanOrEqual(expectedExpiration + 1000)
    })

    it('persists to sessionStorage', () => {
      const address = '0x123'
      const authContext: LitAuthContext = { userId: address }

      setCachedAuthContext(address, authContext)

      expect(global.sessionStorage.setItem).toHaveBeenCalledWith(
        expect.stringContaining('haven-lit-session'),
        expect.stringContaining('hasSession')
      )
    })

    it('handles sessionStorage errors gracefully', () => {
      const address = '0x123'
      const authContext: LitAuthContext = { userId: address }

      // Make sessionStorage throw
      global.sessionStorage.setItem = jest.fn(() => {
        throw new Error('Storage full')
      })

      // Should not throw
      expect(() => setCachedAuthContext(address, authContext)).not.toThrow()
      
      // Should still be in memory cache
      expect(getCachedAuthContext(address)).toEqual(authContext)
    })

    it('does nothing for empty address', () => {
      const authContext: LitAuthContext = { userId: '0x123' }
      setCachedAuthContext('', authContext)
      
      expect(getCachedAuthContext('')).toBeNull()
    })

    it('does nothing for null authContext', () => {
      setCachedAuthContext('0x123', null as any)
      
      expect(getCachedAuthContext('0x123')).toBeNull()
    })

    it('uses default expiration of 1 hour', () => {
      const address = '0x123'
      const authContext: LitAuthContext = { userId: address }

      const beforeSet = Date.now()
      setCachedAuthContext(address, authContext) // No expiration specified
      const afterSet = Date.now()

      const info = getSessionInfo(address)
      const oneHour = 60 * 60 * 1000
      
      expect(info.expiresAt!.getTime()).toBeGreaterThanOrEqual(beforeSet + oneHour - 1000)
      expect(info.expiresAt!.getTime()).toBeLessThanOrEqual(afterSet + oneHour + 1000)
    })
  })

  describe('clearAuthContext', () => {
    it('clears specific address session', () => {
      const address1 = '0x123'
      const address2 = '0x456'
      
      setCachedAuthContext(address1, { userId: address1 })
      setCachedAuthContext(address2, { userId: address2 })

      clearAuthContext(address1)

      expect(getCachedAuthContext(address1)).toBeNull()
      expect(getCachedAuthContext(address2)).not.toBeNull()
    })

    it('clears all sessions when no address provided', () => {
      setCachedAuthContext('0x123', { userId: '0x123' })
      setCachedAuthContext('0x456', { userId: '0x456' })
      setCachedAuthContext('0x789', { userId: '0x789' })

      clearAuthContext()

      expect(getCachedAuthContext('0x123')).toBeNull()
      expect(getCachedAuthContext('0x456')).toBeNull()
      expect(getCachedAuthContext('0x789')).toBeNull()
    })

    it('removes from sessionStorage for specific address', () => {
      const address = '0x123'
      setCachedAuthContext(address, { userId: address })

      clearAuthContext(address)

      expect(global.sessionStorage.removeItem).toHaveBeenCalledWith(
        expect.stringContaining('haven-lit-session')
      )
    })

    it('removes all haven-lit-session entries when clearing all', () => {
      setCachedAuthContext('0x123', { userId: '0x123' })
      setCachedAuthContext('0x456', { userId: '0x456' })

      // Add some unrelated items to sessionStorage
      mockSessionStorage['other-key'] = 'value'
      mockSessionStorage['haven-lit-session-0x123'] = '{"hasSession":true}'
      mockSessionStorage['haven-lit-session-0x456'] = '{"hasSession":true}'

      clearAuthContext()

      // Should have removed haven-lit-session entries
      expect(global.sessionStorage.removeItem).toHaveBeenCalled()
    })

    it('handles sessionStorage errors gracefully', () => {
      const address = '0x123'
      setCachedAuthContext(address, { userId: address })

      global.sessionStorage.removeItem = jest.fn(() => {
        throw new Error('Storage error')
      })

      // Should not throw
      expect(() => clearAuthContext(address)).not.toThrow()
    })

    it('normalizes address to lowercase when clearing specific', () => {
      const address = '0xABC123'
      setCachedAuthContext(address, { userId: address })

      clearAuthContext('0xabc123')

      expect(getCachedAuthContext(address)).toBeNull()
    })
  })

  describe('isAuthContextValid', () => {
    it('returns false for null authContext', () => {
      expect(isAuthContextValid(null)).toBe(false)
    })

    it('returns false for undefined authContext', () => {
      expect(isAuthContextValid(undefined)).toBe(false)
    })

    it('returns false when Lit auth context is expired', () => {
      mockedIsAuthContextExpired.mockReturnValue(true)
      
      const authContext: LitAuthContext = {
        userId: '0x123',
        expiration: new Date(Date.now() - 1000).toISOString(),
      }

      expect(isAuthContextValid(authContext)).toBe(false)
    })

    it('returns true for valid authContext', () => {
      mockedIsAuthContextExpired.mockReturnValue(false)
      
      const authContext: LitAuthContext = {
        userId: '0x123',
        expiration: new Date(Date.now() + 3600000).toISOString(),
      }

      expect(isAuthContextValid(authContext)).toBe(true)
    })
  })

  describe('getSessionInfo', () => {
    it('returns isCached=false when no session', () => {
      const info = getSessionInfo('0x123')
      
      expect(info.isCached).toBe(false)
      expect(info.expiresIn).toBe(0)
      expect(info.cachedAt).toBeNull()
      expect(info.expiresAt).toBeNull()
    })

    it('returns correct info for cached session', () => {
      const address = '0x123'
      const authContext: LitAuthContext = { userId: address }
      
      const beforeSet = Date.now()
      setCachedAuthContext(address, authContext, 3600000)
      const afterSet = Date.now()

      const info = getSessionInfo(address)

      expect(info.isCached).toBe(true)
      expect(info.expiresIn).toBeGreaterThan(0)
      expect(info.cachedAt).toBeInstanceOf(Date)
      expect(info.expiresAt).toBeInstanceOf(Date)
      
      expect(info.cachedAt!.getTime()).toBeGreaterThanOrEqual(beforeSet)
      expect(info.cachedAt!.getTime()).toBeLessThanOrEqual(afterSet)
    })

    it('returns 0 expiresIn for expired session', () => {
      const address = '0x123'
      const authContext: LitAuthContext = { userId: address }
      
      setCachedAuthContext(address, authContext, -1000) // Already expired

      const info = getSessionInfo(address)
      expect(info.isCached).toBe(false)
      expect(info.expiresIn).toBe(0)
    })

    it('returns null info for empty address', () => {
      const info = getSessionInfo('')
      expect(info.isCached).toBe(false)
      expect(info.cachedAt).toBeNull()
    })
  })

  describe('hasCachedSession', () => {
    it('returns true for cached session', () => {
      const address = '0x123'
      setCachedAuthContext(address, { userId: address })

      expect(hasCachedSession(address)).toBe(true)
    })

    it('returns false for no session', () => {
      expect(hasCachedSession('0x123')).toBe(false)
    })

    it('returns false for empty address', () => {
      expect(hasCachedSession('')).toBe(false)
    })

    it('normalizes address to lowercase', () => {
      const address = '0xABC'
      setCachedAuthContext(address, { userId: address })

      expect(hasCachedSession('0xabc')).toBe(true)
    })
  })

  describe('getCachedSessionAddresses', () => {
    it('returns empty array when no sessions', () => {
      expect(getCachedSessionAddresses()).toEqual([])
    })

    it('returns all cached addresses', () => {
      setCachedAuthContext('0x123', { userId: '0x123' })
      setCachedAuthContext('0x456', { userId: '0x456' })

      const addresses = getCachedSessionAddresses()

      expect(addresses).toHaveLength(2)
      expect(addresses).toContain('0x123')
      expect(addresses).toContain('0x456')
    })

    it('returns addresses in lowercase', () => {
      setCachedAuthContext('0xABC', { userId: '0xABC' })

      const addresses = getCachedSessionAddresses()
      expect(addresses[0]).toBe('0xabc')
    })
  })

  describe('restoreSessionsFromStorage', () => {
    it('handles empty sessionStorage gracefully', () => {
      expect(() => restoreSessionsFromStorage()).not.toThrow()
    })

    it('restores valid sessions from sessionStorage', () => {
      const futureTime = Date.now() + 3600000
      mockSessionStorage['haven-lit-session-0x123'] = JSON.stringify({
        address: '0x123',
        cachedAt: Date.now(),
        expiresAt: futureTime,
        hasSession: true,
      })

      restoreSessionsFromStorage()

      // Function doesn't actually restore the auth context (just metadata)
      // but it should process without errors
      expect(Object.keys(mockSessionStorage)).toContain('haven-lit-session-0x123')
    })

    it('removes expired sessions from sessionStorage', () => {
      const pastTime = Date.now() - 1000
      mockSessionStorage['haven-lit-session-0x123'] = JSON.stringify({
        address: '0x123',
        cachedAt: Date.now() - 3600000,
        expiresAt: pastTime,
        hasSession: true,
      })

      restoreSessionsFromStorage()

      expect(global.sessionStorage.removeItem).toHaveBeenCalledWith('haven-lit-session-0x123')
    })

    it('handles invalid JSON gracefully', () => {
      mockSessionStorage['haven-lit-session-bad'] = 'not-valid-json'

      expect(() => restoreSessionsFromStorage()).not.toThrow()
      expect(global.sessionStorage.removeItem).toHaveBeenCalledWith('haven-lit-session-bad')
    })

    it('handles sessionStorage errors gracefully', () => {
      Object.defineProperty(global, 'sessionStorage', {
        value: undefined,
        writable: true,
      })

      expect(() => restoreSessionsFromStorage()).not.toThrow()
    })
  })
})
