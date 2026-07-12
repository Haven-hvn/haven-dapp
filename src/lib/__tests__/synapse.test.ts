import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PieceDownloadError } from '../piece-download'
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
  streamDownloadAndValidatePiece,
} = vi.hoisted(() => ({
  mockDownload: vi.fn(),
  mockClient: { account: { address: '0xdead000000000000000000000000000000000001' } },
  resolvePieceUrl: vi.fn(),
  streamDownloadAndValidatePiece: vi.fn(),
}))

vi.mock('@/lib/piece-download', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../piece-download')>()
  return {
    ...actual,
    streamDownloadAndValidatePiece,
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
    streamDownloadAndValidatePiece.mockResolvedValue(new Uint8Array([7, 8, 9]))
  })

  afterEach(() => {
    resetSynapseInstance()
  })

  it('throws on empty piece CID', async () => {
    await expect(downloadFromSynapse('')).rejects.toMatchObject({
      code: 'INVALID_CID',
    })
  })

  it('always uses FilBeam and chain resolvers for catalog owner', async () => {
    const bytes = await downloadFromSynapse(PIECE, { catalogOwner: OWNER })
    expect(bytes).toEqual(new Uint8Array([7, 8, 9]))
    expect(resolvePieceUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        address: OWNER.toLowerCase(),
        resolvers: [expect.any(Function), expect.any(Function)],
      })
    )
    const resolvers = resolvePieceUrl.mock.calls[0]?.[0]?.resolvers ?? []
    expect(resolvers).toHaveLength(2)
    expect(streamDownloadAndValidatePiece).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://pdp.example/piece',
        expectedPieceCid: PIECE,
      })
    )
    expect(mockDownload).not.toHaveBeenCalled()
  })

  it('does not fall back to throwaway storage.download when owner resolution fails', async () => {
    resolvePieceUrl.mockRejectedValueOnce(new Error('no provider'))
    await expect(
      downloadFromSynapse(PIECE, { catalogOwner: OWNER })
    ).rejects.toMatchObject({ code: 'DOWNLOAD_FAILED' })
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
    expect(resolvePieceUrl).not.toHaveBeenCalled()
  })

  it('forwards signal and onProgress to stream download', async () => {
    const signal = new AbortController().signal
    const onProgress = vi.fn()
    await downloadFromSynapse(PIECE, {
      catalogOwner: OWNER,
      signal,
      onProgress,
    })
    expect(streamDownloadAndValidatePiece).toHaveBeenCalledWith(
      expect.objectContaining({ signal, onProgress })
    )
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

  it('maps PieceCID verification failures to PIECE_VERIFICATION_FAILED', async () => {
    vi.mocked(streamDownloadAndValidatePiece).mockRejectedValueOnce(
      new PieceDownloadError(
        'PieceCID verification failed. Expected: a, Got: b',
        'VERIFICATION_FAILED'
      )
    )
    await expect(
      downloadFromSynapse(PIECE, { catalogOwner: OWNER })
    ).rejects.toMatchObject({ code: 'PIECE_VERIFICATION_FAILED' })
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
