import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  downloadFromSynapse,
  getSynapseErrorMessage,
  resetSynapseInstance,
  SynapseError,
} from '../synapse'

const {
  mockDownload,
  mockClient,
  resolvePieceUrlSequential,
  downloadAndValidate,
} = vi.hoisted(() => ({
  mockDownload: vi.fn(),
  mockClient: { account: { address: '0xdead000000000000000000000000000000000001' } },
  resolvePieceUrlSequential: vi.fn(),
  downloadAndValidate: vi.fn(),
}))

vi.mock('../resolve-piece-url-sequential', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../resolve-piece-url-sequential')>()
  return {
    ...actual,
    resolvePieceUrlSequential,
  }
})

vi.mock('@filoz/synapse-sdk', () => ({
  Synapse: {
    create: vi.fn(() => ({
      client: mockClient,
      storage: {
        withCDN: true,
        download: mockDownload,
      },
    })),
  },
}))

vi.mock('@filoz/synapse-core/piece', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@filoz/synapse-core/piece')>()
  return {
    ...actual,
    asPieceCID: (cid: string) =>
      cid.startsWith('bafkzcib') ? { toString: () => cid } : null,
    downloadAndValidate,
    chainResolver: vi.fn(),
    filbeamResolver: vi.fn(),
  }
})

const PIECE =
  'bafkzcibfyxzpgnyyw7anoyooyzpenb6f6umu7pmo7arhqiefsoefrcjunlzerpvsrqxa'
const OWNER = '0xb24ca10fb6907a2d94b0dc5dbea6b5e379d19ffd'

describe('downloadFromSynapse', () => {
  beforeEach(() => {
    resetSynapseInstance()
    vi.clearAllMocks()
    mockDownload.mockResolvedValue(new Uint8Array([1, 2, 3]))
    resolvePieceUrlSequential.mockResolvedValue('https://pdp.example/piece')
    downloadAndValidate.mockResolvedValue(new Uint8Array([7, 8, 9]))
  })

  afterEach(() => {
    resetSynapseInstance()
  })

  it('throws on empty piece CID', async () => {
    await expect(downloadFromSynapse('')).rejects.toMatchObject({
      code: 'INVALID_CID',
    })
  })

  it('uses sequential owner-aware resolution for catalog owner', async () => {
    const bytes = await downloadFromSynapse(PIECE, { catalogOwner: OWNER })
    expect(bytes).toEqual(new Uint8Array([7, 8, 9]))
    expect(resolvePieceUrlSequential).toHaveBeenCalledWith(
      expect.objectContaining({
        address: OWNER.toLowerCase(),
        resolvers: expect.arrayContaining([expect.any(Function)]),
      })
    )
    expect(downloadAndValidate).toHaveBeenCalled()
    expect(mockDownload).not.toHaveBeenCalled()
  })

  it('does not fall back to throwaway storage.download when owner resolution fails', async () => {
    resolvePieceUrlSequential.mockRejectedValue(new Error('no provider'))
    await expect(
      downloadFromSynapse(PIECE, { catalogOwner: OWNER })
    ).rejects.toMatchObject({ code: 'PIECE_NOT_FOUND' })
    expect(mockDownload).not.toHaveBeenCalled()
  })

  it('passes providerAddress to storage.download', async () => {
    await downloadFromSynapse(PIECE, {
      providerAddress: '0x1111111111111111111111111111111111111111',
    })
    expect(mockDownload).toHaveBeenCalledWith(
      expect.objectContaining({
        providerAddress: '0x1111111111111111111111111111111111111111',
      })
    )
    expect(resolvePieceUrlSequential).not.toHaveBeenCalled()
  })

  it('uses storage.download when no catalog owner', async () => {
    const bytes = await downloadFromSynapse(PIECE)
    expect(bytes).toEqual(new Uint8Array([1, 2, 3]))
    expect(resolvePieceUrlSequential).not.toHaveBeenCalled()
  })

  it('throws INVALID_OWNER for malformed catalog owner', async () => {
    await expect(
      downloadFromSynapse(PIECE, { catalogOwner: 'not-an-address' })
    ).rejects.toMatchObject({ code: 'INVALID_OWNER' })
  })

  it('wraps unexpected errors as DOWNLOAD_FAILED', async () => {
    mockDownload.mockRejectedValue(new Error('network down'))
    await expect(downloadFromSynapse(PIECE)).rejects.toMatchObject({
      code: 'DOWNLOAD_FAILED',
    })
  })
})

describe('getSynapseErrorMessage', () => {
  it('returns friendly messages for known codes', () => {
    expect(
      getSynapseErrorMessage(new SynapseError('x', 'DOWNLOAD_FAILED'))
    ).toMatch(/Filecoin storage/)
    expect(
      getSynapseErrorMessage(new SynapseError('x', 'INVALID_OWNER'))
    ).toMatch(/uploader address/)
    expect(
      getSynapseErrorMessage(new SynapseError('402', 'CDN_RAIL_MISMATCH'))
    ).toMatch(/Re-upload/)
  })
})
