import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prepareEncryptedContentInputs } from '../encrypted-playback-prepare'
import type { Video } from '@/types/video'

const decryptContentKey = vi.fn()
const fetchPinnedContent = vi.fn()
const extractHavenEncryptedPayload = vi.fn()

vi.mock('@/lib/haven-aol', () => ({
  decryptContentKey: (...args: unknown[]) => decryptContentKey(...args),
  isGateMetadata: (m: unknown) =>
    typeof m === 'object' &&
    m !== null &&
    (m as { version?: number }).version === 1,
}))

vi.mock('@/services/ipfsService', () => ({
  DEFAULT_PIECE_DOWNLOAD_TIMEOUT_MS: 900_000,
  fetchPinnedContent: (...args: unknown[]) => fetchPinnedContent(...args),
}))

vi.mock('@/lib/encrypted-payload', () => ({
  extractHavenEncryptedPayload: (...args: unknown[]) =>
    extractHavenEncryptedPayload(...args),
}))

const GATE_METADATA = {
  version: 1 as const,
  cid: 'bafytest',
  chain: 'EthMainnet' as const,
  tokenAddress: '0x0000000000000000000000000000000000000001',
  threshold: '1',
  encryptedAesKey: 'dGVzdA==',
}

function testVideo(overrides: Partial<Video> = {}): Video {
  return {
    id: '0x1',
    owner: '0xb24ca10fb6907a2d94b0dc5dbea6b5e379d19ffd',
    title: 'Test',
    description: '',
    duration: 0,
    isEncrypted: true,
    hasAiData: false,
    createdAt: new Date(),
    encryptionMetadata: GATE_METADATA,
    pieceCid:
      'bafkzcibe2hzbcd4t6clvsb3mfrezyxl75gl3gzcsqi42dd27gktq4nk75rr62ciuaq',
    ...overrides,
  }
}

const walletClient = {
  account: { address: '0xb24ca10fb6907a2d94b0dc5dbea6b5e379d19ffd' },
  signTypedData: vi.fn(),
}

describe('prepareEncryptedContentInputs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    decryptContentKey.mockResolvedValue({
      aesKey: new Uint8Array([1, 2, 3]),
      fromCache: false,
    })
    fetchPinnedContent.mockResolvedValue({
      data: new Uint8Array([9, 8, 7]),
      url: 'synapse://piece',
      gateway: 'synapse',
      size: 3,
      duration: 10,
    })
    extractHavenEncryptedPayload.mockResolvedValue(new Uint8Array([4, 5, 6]))
  })

  it('runs key decrypt and piece fetch in parallel', async () => {
    let resolveKey!: () => void
    let resolveFetch!: () => void
    const keyGate = new Promise<void>((r) => {
      resolveKey = r
    })
    const fetchGate = new Promise<void>((r) => {
      resolveFetch = r
    })

    decryptContentKey.mockImplementation(async () => {
      resolveKey()
      await fetchGate
      return { aesKey: new Uint8Array([1]), fromCache: false }
    })

    fetchPinnedContent.mockImplementation(async () => {
      resolveFetch()
      await keyGate
      return {
        data: new Uint8Array([2]),
        url: 'synapse://x',
        gateway: 'synapse',
        size: 1,
        duration: 1,
      }
    })

    const result = await prepareEncryptedContentInputs({
      video: testVideo(),
      walletClient,
    })

    expect(decryptContentKey).toHaveBeenCalledOnce()
    expect(fetchPinnedContent).toHaveBeenCalledOnce()
    expect(extractHavenEncryptedPayload).toHaveBeenCalledWith(new Uint8Array([2]))
    expect(result.encryptedData).toEqual(new Uint8Array([4, 5, 6]))
    expect(result.aesKey).toEqual(new Uint8Array([1]))
  })

  it('calls abortParallel when either task fails', async () => {
    const abortParallel = vi.fn()
    decryptContentKey.mockRejectedValue(new Error('sign rejected'))

    await expect(
      prepareEncryptedContentInputs({
        video: testVideo(),
        walletClient,
        abortParallel,
      })
    ).rejects.toThrow('sign rejected')

    expect(abortParallel).toHaveBeenCalledOnce()
  })

  it('rejects invalid gate metadata before starting work', async () => {
    await expect(
      prepareEncryptedContentInputs({
        video: testVideo({
          encryptionMetadata: { version: 2 } as unknown as Video['encryptionMetadata'],
        }),
        walletClient,
      })
    ).rejects.toThrow(/gate v1/)

    expect(decryptContentKey).not.toHaveBeenCalled()
    expect(fetchPinnedContent).not.toHaveBeenCalled()
  })
})
