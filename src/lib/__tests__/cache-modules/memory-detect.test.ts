/**
 * Unit tests for memory-detect.ts
 * 
 * Tests for the memory pressure detection and adaptive strategy utilities.
 */

import {
  getMemoryInfo,
  getDecryptionStrategy,
  shouldWarnUser,
  isConstrainedDevice,
  getMemorySummary,
} from '../../memory-detect'

// Mock opfs module
jest.mock('../../opfs', () => ({
  isOpfsAvailable: jest.fn().mockReturnValue(true),
}))

import { isOpfsAvailable } from '../../opfs'
const mockedIsOpfsAvailable = isOpfsAvailable as jest.MockedFunction<typeof isOpfsAvailable>

describe('memory-detect', () => {
  // Store original navigator and performance
  let originalNavigator: typeof navigator
  let originalPerformance: typeof performance

  beforeEach(() => {
    originalNavigator = global.navigator as typeof navigator
    originalPerformance = global.performance as typeof performance
    mockedIsOpfsAvailable.mockReturnValue(true)
  })

  afterEach(() => {
    // Restore originals
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    })
    Object.defineProperty(global, 'performance', {
      value: originalPerformance,
      writable: true,
      configurable: true,
    })
  })

  describe('getMemoryInfo', () => {
    it('returns memory info with available APIs', () => {
      // Mock deviceMemory and performance.memory
      Object.defineProperty(global, 'navigator', {
        value: {
          ...originalNavigator,
          deviceMemory: 8, // 8 GB
          userAgent: 'Chrome/100.0.0.0',
        },
        writable: true,
        configurable: true,
      })
      Object.defineProperty(global, 'performance', {
        value: {
          ...originalPerformance,
          memory: {
            usedJSHeapSize: 100 * 1024 * 1024, // 100 MB
            jsHeapSizeLimit: 2 * 1024 * 1024 * 1024, // 2 GB
          },
        },
        writable: true,
        configurable: true,
      })

      const memory = getMemoryInfo()

      expect(memory.deviceMemory).toBe(8 * 1024 * 1024 * 1024)
      expect(memory.jsHeapUsed).toBe(100 * 1024 * 1024)
      expect(memory.jsHeapLimit).toBe(2 * 1024 * 1024 * 1024)
      expect(memory.hasMemoryApi).toBe(true)
    })

    it('estimates from deviceMemory when heap limit unavailable', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          ...originalNavigator,
          deviceMemory: 4, // 4 GB
          userAgent: 'Chrome/100.0.0.0',
        },
        writable: true,
        configurable: true,
      })
      Object.defineProperty(global, 'performance', {
        value: originalPerformance, // No memory property
        writable: true,
        configurable: true,
      })

      const memory = getMemoryInfo()

      expect(memory.deviceMemory).toBe(4 * 1024 * 1024 * 1024)
      expect(memory.jsHeapLimit).toBe(0)
      // Should estimate 50% of device memory
      expect(memory.estimatedAvailable).toBe(2 * 1024 * 1024 * 1024)
    })

    it('uses default estimate when no APIs available', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          ...originalNavigator,
          userAgent: 'Firefox/100.0.0.0',
        },
        writable: true,
        configurable: true,
      })

      const memory = getMemoryInfo()

      expect(memory.deviceMemory).toBe(0)
      expect(memory.hasMemoryApi).toBe(false)
      expect(memory.estimatedAvailable).toBe(512 * 1024 * 1024) // Default 512MB
    })

    it('detects constrained device by memory', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          ...originalNavigator,
          deviceMemory: 2, // 2 GB (constrained)
          userAgent: 'Chrome/100.0.0.0',
        },
        writable: true,
        configurable: true,
      })

      const memory = getMemoryInfo()
      expect(memory.isConstrained).toBe(true)
    })

    it('detects constrained device by user agent', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          ...originalNavigator,
          deviceMemory: 8,
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)',
        },
        writable: true,
        configurable: true,
      })

      const memory = getMemoryInfo()
      expect(memory.isConstrained).toBe(true)
    })

    it('detects non-constrained desktop', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          ...originalNavigator,
          deviceMemory: 16,
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/100.0.0.0',
        },
        writable: true,
        configurable: true,
      })

      const memory = getMemoryInfo()
      expect(memory.isConstrained).toBe(false)
    })

    it('calculates available memory from heap stats', () => {
      Object.defineProperty(global, 'performance', {
        value: {
          memory: {
            usedJSHeapSize: 500 * 1024 * 1024, // 500 MB used
            jsHeapSizeLimit: 2 * 1024 * 1024 * 1024, // 2 GB limit
          },
        },
        writable: true,
        configurable: true,
      })

      const memory = getMemoryInfo()
      expect(memory.estimatedAvailable).toBe(1.5 * 1024 * 1024 * 1024) // 1.5 GB available
    })
  })

  describe('getDecryptionStrategy', () => {
    beforeEach(() => {
      // Set up a capable device by default
      Object.defineProperty(global, 'navigator', {
        value: {
          deviceMemory: 16,
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
        writable: true,
        configurable: true,
      })
      Object.defineProperty(global, 'performance', {
        value: {
          memory: {
            usedJSHeapSize: 100 * 1024 * 1024,
            jsHeapSizeLimit: 4 * 1024 * 1024 * 1024, // 4 GB heap limit
          },
        },
        writable: true,
        configurable: true,
      })
    })

    it('returns in-memory for small files', () => {
      // Small file (10 MB) with 4 GB available - definitely fits
      const strategy = getDecryptionStrategy(10 * 1024 * 1024)

      expect(strategy.mode).toBe('in-memory')
      expect(strategy.reason).toContain('fits comfortably')
    })

    it('returns opfs-staged for large files on constrained devices', () => {
      // Constrained device with limited memory
      Object.defineProperty(global, 'navigator', {
        value: {
          deviceMemory: 4,
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
        writable: true,
        configurable: true,
      })
      Object.defineProperty(global, 'performance', {
        value: {
          memory: {
            usedJSHeapSize: 1 * 1024 * 1024 * 1024,
            jsHeapSizeLimit: 2 * 1024 * 1024 * 1024,
          },
        },
        writable: true,
        configurable: true,
      })

      // 200 MB file with ~1 GB available - should use OPFS
      const strategy = getDecryptionStrategy(200 * 1024 * 1024)

      expect(strategy.mode).toBe('opfs-staged')
      expect(strategy.reason).toContain('OPFS')
    })

    it('includes warning message for constrained devices with OPFS', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          deviceMemory: 4,
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0)',
        },
        writable: true,
        configurable: true,
      })

      const strategy = getDecryptionStrategy(200 * 1024 * 1024)

      expect(strategy.warningMessage).toBeDefined()
      expect(strategy.warningMessage).toContain('large file')
    })

    it('returns too-large for files exceeding all strategies', () => {
      // Limited memory device
      Object.defineProperty(global, 'navigator', {
        value: {
          deviceMemory: 2,
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
        writable: true,
        configurable: true,
      })
      Object.defineProperty(global, 'performance', {
        value: {
          memory: {
            usedJSHeapSize: 0.5 * 1024 * 1024 * 1024,
            jsHeapSizeLimit: 1 * 1024 * 1024 * 1024,
          },
        },
        writable: true,
        configurable: true,
      })

      // 1 GB file with limited memory
      const strategy = getDecryptionStrategy(1 * 1024 * 1024 * 1024)

      expect(strategy.mode).toBe('too-large')
      expect(strategy.warningMessage).toContain('too large')
    })

    it('falls back to in-memory when OPFS not available', () => {
      mockedIsOpfsAvailable.mockReturnValue(false)

      // File that would normally use OPFS
      Object.defineProperty(global, 'navigator', {
        value: {
          deviceMemory: 8,
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
        writable: true,
        configurable: true,
      })
      Object.defineProperty(global, 'performance', {
        value: {
          memory: {
            usedJSHeapSize: 0.5 * 1024 * 1024 * 1024,
            jsHeapSizeLimit: 2 * 1024 * 1024 * 1024,
          },
        },
        writable: true,
        configurable: true,
      })

      const strategy = getDecryptionStrategy(300 * 1024 * 1024)

      expect(strategy.mode).toBe('in-memory')
      expect(strategy.reason).toContain('OPFS not available')
    })

    it('includes warning when falling back without OPFS', () => {
      mockedIsOpfsAvailable.mockReturnValue(false)

      Object.defineProperty(global, 'navigator', {
        value: {
          deviceMemory: 8,
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
        writable: true,
        configurable: true,
      })
      Object.defineProperty(global, 'performance', {
        value: {
          memory: {
            usedJSHeapSize: 0.5 * 1024 * 1024 * 1024,
            jsHeapSizeLimit: 2 * 1024 * 1024 * 1024,
          },
        },
        writable: true,
        configurable: true,
      })

      const strategy = getDecryptionStrategy(400 * 1024 * 1024)

      expect(strategy.warningMessage).toBeDefined()
    })

    it('includes memory estimates in result', () => {
      const strategy = getDecryptionStrategy(100 * 1024 * 1024)

      expect(strategy.estimatedPeakMemory).toBeGreaterThan(0)
      expect(strategy.estimatedAvailableMemory).toBeGreaterThan(0)
    })
  })

  describe('shouldWarnUser', () => {
    beforeEach(() => {
      Object.defineProperty(global, 'navigator', {
        value: {
          deviceMemory: 8,
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
        writable: true,
        configurable: true,
      })
      Object.defineProperty(global, 'performance', {
        value: {
          memory: {
            usedJSHeapSize: 0.5 * 1024 * 1024 * 1024,
            jsHeapSizeLimit: 2 * 1024 * 1024 * 1024,
          },
        },
        writable: true,
        configurable: true,
      })
    })

    it('returns shouldWarn=false for small files', () => {
      const warning = shouldWarnUser(10 * 1024 * 1024)
      expect(warning.shouldWarn).toBe(false)
    })

    it('returns shouldWarn=true for too-large files', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          deviceMemory: 4,
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
        writable: true,
        configurable: true,
      })
      Object.defineProperty(global, 'performance', {
        value: {
          memory: {
            usedJSHeapSize: 0.5 * 1024 * 1024 * 1024,
            jsHeapSizeLimit: 1 * 1024 * 1024 * 1024,
          },
        },
        writable: true,
        configurable: true,
      })

      const warning = shouldWarnUser(1 * 1024 * 1024 * 1024)

      expect(warning.shouldWarn).toBe(true)
      expect(warning.message).toContain('too large')
    })

    it('includes suggestion for large files', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          deviceMemory: 4,
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0)',
        },
        writable: true,
        configurable: true,
      })

      const warning = shouldWarnUser(300 * 1024 * 1024)

      expect(warning.suggestion).toBeDefined()
    })

    it('warns about performance issues without OPFS', () => {
      mockedIsOpfsAvailable.mockReturnValue(false)

      Object.defineProperty(global, 'navigator', {
        value: {
          deviceMemory: 8,
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
        writable: true,
        configurable: true,
      })
      Object.defineProperty(global, 'performance', {
        value: {
          memory: {
            usedJSHeapSize: 0.5 * 1024 * 1024 * 1024,
            jsHeapSizeLimit: 2 * 1024 * 1024 * 1024,
          },
        },
        writable: true,
        configurable: true,
      })

      const warning = shouldWarnUser(500 * 1024 * 1024)

      expect(warning.shouldWarn).toBe(true)
      expect(warning.suggestion).toContain('Chrome or Edge')
    })
  })

  describe('isConstrainedDevice', () => {
    it('returns true for low memory devices', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          deviceMemory: 2,
          userAgent: 'Chrome/100.0.0.0',
        },
        writable: true,
        configurable: true,
      })

      expect(isConstrainedDevice()).toBe(true)
    })

    it('returns true for mobile devices', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          deviceMemory: 8,
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0)',
        },
        writable: true,
        configurable: true,
      })

      expect(isConstrainedDevice()).toBe(true)
    })

    it('returns false for capable desktop', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          deviceMemory: 16,
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
        writable: true,
        configurable: true,
      })

      expect(isConstrainedDevice()).toBe(false)
    })
  })

  describe('getMemorySummary', () => {
    it('returns formatted memory summary', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          deviceMemory: 8,
          userAgent: 'Chrome/100.0.0.0',
        },
        writable: true,
        configurable: true,
      })
      Object.defineProperty(global, 'performance', {
        value: {
          memory: {
            usedJSHeapSize: 100 * 1024 * 1024,
            jsHeapSizeLimit: 2 * 1024 * 1024 * 1024,
          },
        },
        writable: true,
        configurable: true,
      })

      const summary = getMemorySummary()

      expect(summary.deviceMemory).toContain('GB')
      expect(summary.jsHeapUsed).toContain('MB')
      expect(summary.jsHeapLimit).toContain('GB')
      expect(summary.available).toBeDefined()
      expect(summary.status).toMatch(/Constrained|Capable/)
      expect(summary.hasMemoryApi).toBe(true)
    })

    it('returns Unknown for unavailable APIs', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Firefox/100.0.0.0',
        },
        writable: true,
        configurable: true,
      })

      const summary = getMemorySummary()

      expect(summary.deviceMemory).toBe('Unknown')
      expect(summary.jsHeapUsed).toBe('Unknown')
      expect(summary.jsHeapLimit).toBe('Unknown')
      expect(summary.hasMemoryApi).toBe(false)
    })

    it('returns Constrained status for low memory', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          deviceMemory: 2,
          userAgent: 'Chrome/100.0.0.0',
        },
        writable: true,
        configurable: true,
      })

      const summary = getMemorySummary()
      expect(summary.status).toBe('Constrained')
    })

    it('returns Capable status for high memory', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          deviceMemory: 16,
          userAgent: 'Chrome/100.0.0.0',
        },
        writable: true,
        configurable: true,
      })

      const summary = getMemorySummary()
      expect(summary.status).toBe('Capable')
    })
  })
})
