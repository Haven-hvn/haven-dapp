/**
 * Test Fixtures for Cache Tests
 * 
 * Provides reusable mock data generators for Video and CachedVideo objects.
 */

import type { Video, SegmentMetadata, CodecVariant } from '../../../types/video'
import type { CachedVideo } from '../../../types/cache'

/**
 * Generate a random hex ID
 */
export function generateId(): string {
  return '0x' + Math.random().toString(16).slice(2).padStart(40, '0')
}

/**
 * Create a mock Video object with optional overrides
 */
export function createMockVideo(overrides?: Partial<Video>): Video {
  const now = new Date()
  return {
    // Identity
    id: generateId(),
    owner: '0xabcdef1234567890abcdef1234567890abcdef12',

    // Content metadata
    title: 'Test Video',
    description: 'A test video description',
    duration: 120,

    // Storage CIDs
    filecoinCid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
    encryptedCid: undefined,

    // Encryption
    isEncrypted: false,
    litEncryptionMetadata: undefined,

    // AI analysis
    hasAiData: false,
    vlmJsonCid: undefined,

    // Minting
    mintId: undefined,

    // Source tracking
    sourceUri: undefined,
    creatorHandle: undefined,

    // Timestamps
    createdAt: new Date('2024-06-15T10:00:00Z'),
    updatedAt: undefined,

    // Variants and segments
    codecVariants: undefined,
    segmentMetadata: undefined,

    // UI state (not persisted)
    isLoading: false,
    error: undefined,

    ...overrides,
  }
}

/**
 * Create a mock CachedVideo object with optional overrides
 */
export function createMockCachedVideo(overrides?: Partial<CachedVideo>): CachedVideo {
  const now = Date.now()
  const createdAtTime = new Date('2024-06-15T10:00:00Z').getTime()

  return {
    // Fields from Video (as timestamps)
    id: generateId(),
    owner: '0xabcdef1234567890abcdef1234567890abcdef12',
    title: 'Test Video',
    description: 'A test video description',
    duration: 120,
    filecoinCid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
    encryptedCid: undefined,
    isEncrypted: false,
    litEncryptionMetadata: undefined,
    hasAiData: false,
    vlmJsonCid: undefined,
    mintId: undefined,
    sourceUri: undefined,
    creatorHandle: undefined,
    createdAt: createdAtTime,
    updatedAt: undefined,
    codecVariants: undefined,
    segmentMetadata: undefined,

    // Cache metadata
    cachedAt: now,
    lastSyncedAt: now,
    lastAccessedAt: now,
    cacheVersion: 1,

    // Arkiv entity status
    arkivEntityStatus: 'active',
    arkivEntityKey: generateId(),
    expiresAtBlock: undefined,

    // Sync metadata
    syncHash: undefined,
    isDirty: false,

    // Video Content Cache integration
    videoCacheStatus: 'not-cached',
    videoCachedAt: undefined,

    ...overrides,
  }
}

/**
 * Create a mock SegmentMetadata object
 */
export function createMockSegmentMetadata(overrides?: Partial<SegmentMetadata>): SegmentMetadata {
  return {
    startTimestamp: new Date('2024-06-15T10:00:00Z'),
    endTimestamp: new Date('2024-06-15T10:05:00Z'),
    segmentIndex: 1,
    totalSegments: 5,
    ...overrides,
  }
}

/**
 * Create mock codec variants
 */
export function createMockCodecVariants(): CodecVariant[] {
  return [
    {
      codec: 'h264',
      resolution: '1920x1080',
      bitrate: 5000000,
      cid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
    },
    {
      codec: 'h264',
      resolution: '1280x720',
      bitrate: 2500000,
      cid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdj',
    },
    {
      codec: 'h264',
      resolution: '854x480',
      bitrate: 1000000,
      cid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdk',
    },
  ]
}

/**
 * Create a minimal Video with only required fields
 */
export function createMinimalVideo(overrides?: Partial<Video>): Video {
  return {
    id: generateId(),
    owner: '0xabcdef1234567890abcdef1234567890abcdef12',
    title: 'Minimal Video',
    description: '',
    duration: 0,
    filecoinCid: '',
    isEncrypted: false,
    hasAiData: false,
    createdAt: new Date(),
    ...overrides,
  }
}

/**
 * Create a Video with all optional fields populated
 */
export function createFullVideo(overrides?: Partial<Video>): Video {
  return createMockVideo({
    description: 'Full video with all fields',
    encryptedCid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdl',
    isEncrypted: true,
    litEncryptionMetadata: {
      encryptedSymmetricKey: '0x1234567890abcdef',
      accessControlConditions: [],
      chain: 'ethereum',
    },
    hasAiData: true,
    vlmJsonCid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdm',
    mintId: 'mint-123',
    sourceUri: 'https://example.com/source',
    creatorHandle: '@testuser',
    updatedAt: new Date('2024-06-16T10:00:00Z'),
    codecVariants: createMockCodecVariants(),
    segmentMetadata: createMockSegmentMetadata(),
    ...overrides,
  })
}

/**
 * Create a CachedVideo with all optional fields populated
 */
export function createFullCachedVideo(overrides?: Partial<CachedVideo>): CachedVideo {
  const base = createMockCachedVideo()
  const now = Date.now()

  return {
    ...base,
    description: 'Full cached video with all fields',
    encryptedCid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdl',
    isEncrypted: true,
    litEncryptionMetadata: {
      encryptedSymmetricKey: '0x1234567890abcdef',
      accessControlConditions: [],
      chain: 'ethereum',
    },
    hasAiData: true,
    vlmJsonCid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdm',
    mintId: 'mint-123',
    sourceUri: 'https://example.com/source',
    creatorHandle: '@testuser',
    updatedAt: new Date('2024-06-16T10:00:00Z').getTime(),
    codecVariants: createMockCodecVariants(),
    segmentMetadata: {
      startTimestamp: new Date('2024-06-15T10:00:00Z').getTime(),
      endTimestamp: new Date('2024-06-15T10:05:00Z').getTime(),
      segmentIndex: 1,
      totalSegments: 5,
    },
    expiresAtBlock: 12345678,
    syncHash: 'a'.repeat(64),
    videoCacheStatus: 'cached',
    videoCachedAt: now,
    ...overrides,
  }
}
