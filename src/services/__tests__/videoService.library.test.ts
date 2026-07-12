/**
 * Library video fetch tests — full Arkiv list for library pagination.
 */

import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fetchLibraryVideos, pickMostRecentVideos } from '../videoService'
import { getVideoCacheService, clearServiceInstances } from '../cacheService'
import { deleteDatabase } from '../../lib/cache'
import { createMockVideo } from '../../lib/cache/__tests__/fixtures'
import * as arkivModule from '../../lib/arkiv'

const TEST_WALLET = '0x1234567890abcdef1234567890abcdef12345678'

vi.mock('../../lib/arkiv', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/arkiv')>()
  return {
    ...actual,
    createArkivClient: vi.fn(() => ({})),
    getAllEntitiesByOwner: vi.fn(),
  }
})

vi.mock('../../lib/parse-arkiv-video', () => ({
  parseArkivEntityToVideo: (entity: {
    key: string
    owner: string
    attributes: { title?: string }
    created_at_block: number
  }) => ({
    id: entity.key,
    owner: entity.owner.toLowerCase(),
    title: (entity.attributes.title as string) || 'Untitled',
    description: '',
    duration: 0,
    isEncrypted: false,
    hasAiData: false,
    createdAt: new Date(entity.created_at_block),
    createdAtBlock: entity.created_at_block,
    arkivStatus: 'active' as const,
  }),
}))

function createMockArkivEntity(key: string, title: string, createdAtBlock = 1000) {
  return {
    key,
    owner: TEST_WALLET,
    attributes: { title, is_encrypted: 0 },
    payload: '',
    content_type: 'application/json',
    created_at: String(createdAtBlock),
    created_at_block: createdAtBlock,
  }
}

describe('pickMostRecentVideos', () => {
  it('returns videos sorted by createdAtBlock descending', () => {
    const older = createMockVideo({
      id: '0x1',
      title: 'Older',
      createdAt: new Date('2025-01-01'),
      createdAtBlock: 100,
    })
    const newer = createMockVideo({
      id: '0x2',
      title: 'Newer',
      createdAt: new Date('2024-01-01'),
      createdAtBlock: 9000,
    })

    const result = pickMostRecentVideos([older, newer])

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('0x2')
  })

  it('respects custom limit', () => {
    const videos = [1, 2, 3].map((n) =>
      createMockVideo({
        id: `0x${n}`,
        createdAt: new Date(2024, 0, n),
      })
    )

    expect(pickMostRecentVideos(videos, 2)).toHaveLength(2)
  })
})

describe('fetchLibraryVideos', () => {
  beforeEach(async () => {
    clearServiceInstances()
    try {
      await deleteDatabase(TEST_WALLET)
    } catch {
      // ignore
    }
    vi.mocked(arkivModule.getAllEntitiesByOwner).mockReset()
  })

  afterEach(async () => {
    clearServiceInstances()
    try {
      await deleteDatabase(TEST_WALLET)
    } catch {
      // ignore
    }
    vi.restoreAllMocks()
  })

  it('returns all videos from Arkiv when entities exist', async () => {
    vi.mocked(arkivModule.getAllEntitiesByOwner).mockResolvedValue([
      createMockArkivEntity('0x1', 'First', 100),
      createMockArkivEntity('0x2', 'Second', 200),
    ])

    const videos = await fetchLibraryVideos(TEST_WALLET)

    expect(arkivModule.getAllEntitiesByOwner).toHaveBeenCalledOnce()
    expect(videos).toHaveLength(2)
    expect(videos.map((v) => v.id).sort()).toEqual(['0x1', '0x2'])
  })

  it('returns empty array when Arkiv has no entities and cache is empty', async () => {
    vi.mocked(arkivModule.getAllEntitiesByOwner).mockResolvedValue([])

    const videos = await fetchLibraryVideos(TEST_WALLET)

    expect(videos).toHaveLength(0)
  })

  it('falls back to cached videos when Arkiv fails', async () => {
    const cacheService = getVideoCacheService(TEST_WALLET)
    const older = createMockVideo({
      id: '0xold',
      owner: TEST_WALLET,
      createdAt: new Date('2025-06-01'),
      createdAtBlock: 100,
    })
    const newer = createMockVideo({
      id: '0xnew',
      owner: TEST_WALLET,
      createdAt: new Date('2024-01-01'),
      createdAtBlock: 9000,
    })
    await cacheService.cacheVideos([older, newer])

    vi.mocked(arkivModule.getAllEntitiesByOwner).mockRejectedValue(
      new Error('Network error')
    )

    const videos = await fetchLibraryVideos(TEST_WALLET)

    expect(videos).toHaveLength(2)
    expect(videos.map((v) => v.id).sort()).toEqual(['0xnew', '0xold'])
  })

  it('throws when Arkiv fails and cache is empty', async () => {
    vi.mocked(arkivModule.getAllEntitiesByOwner).mockRejectedValue(
      new Error('Network error')
    )

    await expect(fetchLibraryVideos(TEST_WALLET)).rejects.toThrow('Network error')
  })
})
