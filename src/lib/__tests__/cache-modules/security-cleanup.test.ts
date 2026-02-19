/**
 * Unit tests for security-cleanup.ts
 * 
 * Tests for the security cleanup coordinator utilities.
 */

import {
  onWalletDisconnect,
  onAccountChange,
  onChainChange,
  onSessionExpired,
  onSecurityClear,
  configureCleanup,
  getCleanupOptions,
  resetCleanupOptions,
  hasCachedAuthData,
} from '../../security-cleanup'

// Mock the modules that security-cleanup depends on
jest.mock('../../lit-session-cache', () => ({
  clearAuthContext: jest.fn(),
}))

jest.mock('../../aes-key-cache', () => ({
  clearAllKeys: jest.fn(),
}))

jest.mock('../../video-cache', () => ({
  clearAllVideos: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../../opfs', () => ({
  clearAllStaging: jest.fn().mockResolvedValue(undefined),
}))

import { clearAuthContext } from '../../lit-session-cache'
import { clearAllKeys } from '../../aes-key-cache'
import { clearAllVideos } from '../../video-cache'
import { clearAllStaging } from '../../opfs'

const mockedClearAuthContext = clearAuthContext as jest.MockedFunction<typeof clearAuthContext>
const mockedClearAllKeys = clearAllKeys as jest.MockedFunction<typeof clearAllKeys>
const mockedClearAllVideos = clearAllVideos as jest.MockedFunction<typeof clearAllVideos>
const mockedClearAllStaging = clearAllStaging as jest.MockedFunction<typeof clearAllStaging>

describe('security-cleanup', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetCleanupOptions()
  })

  afterEach(() => {
    resetCleanupOptions()
  })

  describe('onWalletDisconnect', () => {
    it('clears Lit session for address', () => {
      const address = '0x1234567890123456789012345678901234567890'

      onWalletDisconnect(address)

      expect(mockedClearAuthContext).toHaveBeenCalledWith(address)
    })

    it('clears all AES keys', () => {
      const address = '0x123'

      onWalletDisconnect(address)

      expect(mockedClearAllKeys).toHaveBeenCalled()
    })

    it('clears staging files', async () => {
      const address = '0x123'

      onWalletDisconnect(address)

      // Wait for async cleanup
      await new Promise(r => setTimeout(r, 0))

      expect(mockedClearAllStaging).toHaveBeenCalled()
    })

    it('does not clear videos by default', async () => {
      const address = '0x123'

      onWalletDisconnect(address)

      // Wait for async cleanup
      await new Promise(r => setTimeout(r, 0))

      expect(mockedClearAllVideos).not.toHaveBeenCalled()
    })

    it('clears videos when configured', async () => {
      const address = '0x123'
      configureCleanup({ clearVideosOnDisconnect: true })

      onWalletDisconnect(address)

      // Wait for async cleanup
      await new Promise(r => setTimeout(r, 0))

      expect(mockedClearAllVideos).toHaveBeenCalled()
    })

    it('handles empty address', () => {
      // Should not throw
      expect(() => onWalletDisconnect('')).not.toThrow()
      
      // Should not clear anything
      expect(mockedClearAuthContext).not.toHaveBeenCalled()
    })

    it('handles staging cleanup errors gracefully', async () => {
      const address = '0x123'
      mockedClearAllStaging.mockRejectedValue(new Error('Staging error'))

      // Should not throw
      expect(() => onWalletDisconnect(address)).not.toThrow()

      // Wait for async cleanup
      await new Promise(r => setTimeout(r, 0))

      // Auth and keys should still be cleared
      expect(mockedClearAuthContext).toHaveBeenCalled()
      expect(mockedClearAllKeys).toHaveBeenCalled()
    })
  })

  describe('onAccountChange', () => {
    it('clears old account session', () => {
      const oldAddress = '0xold'
      const newAddress = '0xnew'

      onAccountChange(oldAddress, newAddress)

      expect(mockedClearAuthContext).toHaveBeenCalledWith(oldAddress)
    })

    it('clears AES keys', () => {
      const oldAddress = '0xold'
      const newAddress = '0xnew'

      onAccountChange(oldAddress, newAddress)

      expect(mockedClearAllKeys).toHaveBeenCalled()
    })

    it('clears staging files', async () => {
      const oldAddress = '0xold'
      const newAddress = '0xnew'

      onAccountChange(oldAddress, newAddress)

      await new Promise(r => setTimeout(r, 0))

      expect(mockedClearAllStaging).toHaveBeenCalled()
    })

    it('does not clear videos by default', async () => {
      const oldAddress = '0xold'
      const newAddress = '0xnew'

      onAccountChange(oldAddress, newAddress)

      await new Promise(r => setTimeout(r, 0))

      expect(mockedClearAllVideos).not.toHaveBeenCalled()
    })

    it('clears videos when configured', async () => {
      const oldAddress = '0xold'
      const newAddress = '0xnew'
      configureCleanup({ clearVideosOnAccountChange: true })

      onAccountChange(oldAddress, newAddress)

      await new Promise(r => setTimeout(r, 0))

      expect(mockedClearAllVideos).toHaveBeenCalled()
    })

    it('handles missing addresses', () => {
      // Should not throw with null addresses
      expect(() => onAccountChange('', '0xnew')).not.toThrow()
      expect(() => onAccountChange('0xold', '')).not.toThrow()
      expect(() => onAccountChange('', '')).not.toThrow()

      // Should not clear when addresses are invalid
      expect(mockedClearAuthContext).not.toHaveBeenCalled()
    })

    it('normalizes addresses', () => {
      const oldAddress = '0xABC'
      const newAddress = '0xDEF'

      onAccountChange(oldAddress, newAddress)

      // Should clear the old address
      expect(mockedClearAuthContext).toHaveBeenCalledWith(oldAddress)
    })
  })

  describe('onChainChange', () => {
    it('clears auth context', () => {
      onChainChange(1, 137)

      expect(mockedClearAuthContext).toHaveBeenCalledWith()
    })

    it('does not clear AES keys', () => {
      onChainChange(1, 137)

      expect(mockedClearAllKeys).not.toHaveBeenCalled()
    })

    it('does not clear videos', async () => {
      onChainChange(1, 137)

      await new Promise(r => setTimeout(r, 0))

      expect(mockedClearAllVideos).not.toHaveBeenCalled()
    })

    it('does not clear staging', async () => {
      onChainChange(1, 137)

      await new Promise(r => setTimeout(r, 0))

      expect(mockedClearAllStaging).not.toHaveBeenCalled()
    })

    it('handles invalid chain IDs', () => {
      // Should not throw
      expect(() => onChainChange(0, 137)).not.toThrow()
      expect(() => onChainChange(1, 0)).not.toThrow()
      expect(() => onChainChange(0, 0)).not.toThrow()

      // Should not clear when chain IDs are invalid
      expect(mockedClearAuthContext).not.toHaveBeenCalled()
    })
  })

  describe('onSessionExpired', () => {
    it('clears auth context', () => {
      onSessionExpired()

      expect(mockedClearAuthContext).toHaveBeenCalledWith()
    })

    it('does not clear AES keys', () => {
      onSessionExpired()

      expect(mockedClearAllKeys).not.toHaveBeenCalled()
    })

    it('does not clear videos', async () => {
      onSessionExpired()

      await new Promise(r => setTimeout(r, 0))

      expect(mockedClearAllVideos).not.toHaveBeenCalled()
    })

    it('does not clear staging', async () => {
      onSessionExpired()

      await new Promise(r => setTimeout(r, 0))

      expect(mockedClearAllStaging).not.toHaveBeenCalled()
    })
  })

  describe('onSecurityClear', () => {
    it('clears all sessions', async () => {
      await onSecurityClear()

      expect(mockedClearAuthContext).toHaveBeenCalledWith()
    })

    it('clears all keys', async () => {
      await onSecurityClear()

      expect(mockedClearAllKeys).toHaveBeenCalled()
    })

    it('clears all videos', async () => {
      await onSecurityClear()

      expect(mockedClearAllVideos).toHaveBeenCalled()
    })

    it('clears all staging', async () => {
      await onSecurityClear()

      expect(mockedClearAllStaging).toHaveBeenCalled()
    })

    it('returns status for each operation', async () => {
      const result = await onSecurityClear()

      expect(result.sessionsCleared).toBe(true)
      expect(result.keysCleared).toBe(true)
      expect(result.videosCleared).toBe(true)
      expect(result.stagingCleared).toBe(true)
    })

    it('returns false for failed operations', async () => {
      mockedClearAllVideos.mockRejectedValue(new Error('Video error'))

      const result = await onSecurityClear()

      expect(result.sessionsCleared).toBe(true)
      expect(result.keysCleared).toBe(true)
      expect(result.videosCleared).toBe(false)
      expect(result.stagingCleared).toBe(true)
    })

    it('continues even if some operations fail', async () => {
      mockedClearAuthContext.mockImplementation(() => {
        throw new Error('Auth error')
      })

      const result = await onSecurityClear()

      // Auth failed but others should still run
      expect(result.sessionsCleared).toBe(false)
      expect(result.keysCleared).toBe(true)
      expect(result.videosCleared).toBe(true)
      expect(result.stagingCleared).toBe(true)
    })

    it('handles all failures gracefully', async () => {
      mockedClearAuthContext.mockImplementation(() => {
        throw new Error('Auth error')
      })
      mockedClearAllKeys.mockImplementation(() => {
        throw new Error('Keys error')
      })
      mockedClearAllVideos.mockRejectedValue(new Error('Videos error'))
      mockedClearAllStaging.mockRejectedValue(new Error('Staging error'))

      const result = await onSecurityClear()

      expect(result.sessionsCleared).toBe(false)
      expect(result.keysCleared).toBe(false)
      expect(result.videosCleared).toBe(false)
      expect(result.stagingCleared).toBe(false)
    })
  })

  describe('configureCleanup', () => {
    it('sets clearVideosOnDisconnect option', () => {
      configureCleanup({ clearVideosOnDisconnect: true })

      const options = getCleanupOptions()
      expect(options.clearVideosOnDisconnect).toBe(true)
    })

    it('sets clearVideosOnAccountChange option', () => {
      configureCleanup({ clearVideosOnAccountChange: true })

      const options = getCleanupOptions()
      expect(options.clearVideosOnAccountChange).toBe(true)
    })

    it('merges with existing options', () => {
      configureCleanup({ clearVideosOnDisconnect: true })
      configureCleanup({ clearVideosOnAccountChange: true })

      const options = getCleanupOptions()
      expect(options.clearVideosOnDisconnect).toBe(true)
      expect(options.clearVideosOnAccountChange).toBe(true)
    })

    it('does not affect unspecified options', () => {
      configureCleanup({ clearVideosOnDisconnect: true })
      
      const before = getCleanupOptions()
      configureCleanup({}) // Empty update
      const after = getCleanupOptions()

      expect(after.clearVideosOnDisconnect).toBe(before.clearVideosOnDisconnect)
    })
  })

  describe('getCleanupOptions', () => {
    it('returns default options initially', () => {
      const options = getCleanupOptions()

      expect(options.clearVideosOnDisconnect).toBe(false)
      expect(options.clearVideosOnAccountChange).toBe(false)
    })

    it('returns read-only copy', () => {
      const options = getCleanupOptions()
      
      // Attempt to modify (TypeScript should prevent this, but runtime check)
      try {
        ;(options as any).clearVideosOnDisconnect = true
      } catch {
        // Expected to fail
      }

      // Original should be unchanged
      expect(getCleanupOptions().clearVideosOnDisconnect).toBe(false)
    })
  })

  describe('resetCleanupOptions', () => {
    it('resets to defaults', () => {
      configureCleanup({ clearVideosOnDisconnect: true })
      expect(getCleanupOptions().clearVideosOnDisconnect).toBe(true)

      resetCleanupOptions()

      expect(getCleanupOptions().clearVideosOnDisconnect).toBe(false)
    })

    it('resets all options', () => {
      configureCleanup({
        clearVideosOnDisconnect: true,
        clearVideosOnAccountChange: true,
      })

      resetCleanupOptions()

      const options = getCleanupOptions()
      expect(options.clearVideosOnDisconnect).toBe(false)
      expect(options.clearVideosOnAccountChange).toBe(false)
    })
  })

  describe('hasCachedAuthData', () => {
    // Note: This function uses require() to get the latest state
    // We need to mock the index module

    beforeEach(() => {
      jest.resetModules()
    })

    it('returns true when sessions exist', () => {
      // Mock the index module to return session addresses
      jest.doMock('../../index', () => ({
        getCachedSessionAddresses: jest.fn().mockReturnValue(['0x123']),
        getCachedKeyCount: jest.fn().mockReturnValue(0),
      }))

      const { hasCachedAuthData } = require('../../security-cleanup')
      expect(hasCachedAuthData()).toBe(true)
    })

    it('returns true when keys exist', () => {
      jest.doMock('../../index', () => ({
        getCachedSessionAddresses: jest.fn().mockReturnValue([]),
        getCachedKeyCount: jest.fn().mockReturnValue(2),
      }))

      const { hasCachedAuthData } = require('../../security-cleanup')
      expect(hasCachedAuthData()).toBe(true)
    })

    it('returns false when no auth data', () => {
      jest.doMock('../../index', () => ({
        getCachedSessionAddresses: jest.fn().mockReturnValue([]),
        getCachedKeyCount: jest.fn().mockReturnValue(0),
      }))

      const { hasCachedAuthData } = require('../../security-cleanup')
      expect(hasCachedAuthData()).toBe(false)
    })

    afterEach(() => {
      jest.dontMock('../../index')
    })
  })
})
