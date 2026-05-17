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
  resolvePieceUrl,
  downloadAndValidate,
} = vi.hoisted(() => ({
  mockDownload: vi.fn(),
  mockClient: { account: { address: '0xdead000000000000000000000000000000000001' } },
  resolvePieceUrl: vi.fn(),
  downloadAndValidate: vi.fn(),
}))

vi.mock('@filoz/synapse-sdk', () => ({
  Synapse: {
    create: vi.fn(() => ({
      client: mockClient,
      storage: {
        withCDN: false,
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
    resolvePieceUrl,
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
    resolvePieceUrl.mockResolvedValue('https://pdp.example/piece')
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

  it('uses catalog owner resolution when provided', async () => {
    const bytes = await downloadFromSynapse(PIECE, { catalogOwner: OWNER })
    expect(bytes).toEqual(new Uint8Array([7, 8, 9]))
    expect(resolvePieceUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        address: OWNER.toLowerCase(),
      })
    )
    expect(downloadAndValidate).toHaveBeenCalled()
    expect(mockDownload).not.toHaveBeenCalled()
  })

  it('falls back to storage.download when owner resolution fails', async () => {
    resolvePieceUrl.mockRejectedValueOnce(new Error('no provider'))
    const bytes = await downloadFromSynapse(PIECE, { catalogOwner: OWNER })
    expect(bytes).toEqual(new Uint8Array([1, 2, 3]))
    expect(mockDownload).toHaveBeenCalled()
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
    expect(resolvePieceUrl).not.toHaveBeenCalled()
  })

  it('uses storage.download when no catalog owner', async () => {
    const bytes = await downloadFromSynapse(PIECE)
    expect(bytes).toEqual(new Uint8Array([1, 2, 3]))
    expect(resolvePieceUrl).not.toHaveBeenCalled()
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
    ).toMatch(/owner address/)
  })
})
