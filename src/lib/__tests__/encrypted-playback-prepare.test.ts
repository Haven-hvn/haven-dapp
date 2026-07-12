import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prepareEncryptedContentInputs } from '../encrypted-playback-prepare'
import type { Video } from '@/types/video'

const decryptAnyContentKey = vi.fn()
const fetchPinnedContent = vi.fn()
const extractHavenEncryptedPayload = vi.fn()

// `parseAnyGateMetadata` is a soft-fail dispatcher: for our mock we accept any
// object whose `version` is exactly `1` or `3` and return it unchanged. This
// matches the SDK behavior we care about here (Sprint 5 `haven-aol-metadata.ts`).
vi.mock('@/lib/haven-aol', () => ({
  decryptAnyContentKey: (...args: unknown[]) => decryptAnyContentKey(...args),
  parseAnyGateMetadata: (m: unknown) => {
    if (!m || typeof m !== 'object') return null
    const v = (m as { version?: unknown }).version
    if (v === 1 || v === 3) return m
    return null
  },
}))

vi.mock('@/services/ipfsService', () => ({
  DEFAULT_PIECE_DOWNLOAD_TIMEOUT_MS: 900_000,
  fetchPinnedContent: (...args: unknown[]) => fetchPinnedContent(...args),
}))

vi.mock('@/lib/encrypted-payload', () => ({
  extractHavenEncryptedPayload: (...args: unknown[]) =>
    extractHavenEncryptedPayload(...args),
}))

const GATE_METADATA_V1 = {
  version: 1 as const,
  cid: 'bafytest',
  chain: 'EthMainnet' as const,
  tokenAddress: '0x0000000000000000000000000000000000000001',
  threshold: '1',
  encryptedAesKey: 'dGVzdA==',
}

const GATE_METADATA_V3 = {
  version: 3 as const,
  chain: 'EthMainnet' as const,
  tokenAddress: '0x0000000000000000000000000000000000000001',
  threshold: '1',
  epoch: 100,
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
    encryptionMetadata: GATE_METADATA_V1,
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
    decryptAnyContentKey.mockResolvedValue({
      aesKey: new Uint8Array([1, 2, 3]),
      fromCache: false,
      version: 1,
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

    decryptAnyContentKey.mockImplementation(async () => {
      resolveKey()
      await fetchGate
      return { aesKey: new Uint8Array([1]), fromCache: false, version: 1 }
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

    expect(decryptAnyContentKey).toHaveBeenCalledOnce()
    expect(fetchPinnedContent).toHaveBeenCalledOnce()
    expect(extractHavenEncryptedPayload).toHaveBeenCalledWith(new Uint8Array([2]))
    expect(result.encryptedData).toEqual(new Uint8Array([4, 5, 6]))
    expect(result.aesKey).toEqual(new Uint8Array([1]))
    expect(result.version).toBe(1)
  })

  it('routes v3 gate metadata through the same pipeline and surfaces version=3', async () => {
    // v3 uploads land the same way — only difference is the routed decrypt
    // path returns `{ version: 3 }` and (in real code) a `fromGateKeyCache`
    // flag; the prepare wrapper is version-agnostic.
    decryptAnyContentKey.mockResolvedValue({
      aesKey: new Uint8Array([0xaa, 0xbb, 0xcc]),
      fromCache: false,
      version: 3,
      fromGateKeyCache: false,
    })

    const result = await prepareEncryptedContentInputs({
      video: testVideo({ encryptionMetadata: GATE_METADATA_V3 }),
      walletClient,
    })

    // The dispatcher must have been handed the v3 record (not silently
    // downgraded to v1 or dropped). This is what regressed pre-fix — the
    // v1-only isGateMetadata guard would throw before reaching the dispatcher.
    expect(decryptAnyContentKey).toHaveBeenCalledOnce()
    const call = decryptAnyContentKey.mock.calls[0][0] as {
      encryptionMetadata: { version: number }
    }
    expect(call.encryptionMetadata.version).toBe(3)
    expect(result.aesKey).toEqual(new Uint8Array([0xaa, 0xbb, 0xcc]))
    expect(result.version).toBe(3)
  })

  it('calls abortParallel when either task fails', async () => {
    const abortParallel = vi.fn()
    decryptAnyContentKey.mockRejectedValue(new Error('sign rejected'))

    await expect(
      prepareEncryptedContentInputs({
        video: testVideo(),
        walletClient,
        abortParallel,
      })
    ).rejects.toThrow('sign rejected')

    expect(abortParallel).toHaveBeenCalledOnce()
  })

  it('rejects invalid gate metadata (unknown version) before starting work', async () => {
    await expect(
      prepareEncryptedContentInputs({
        video: testVideo({
          encryptionMetadata: {
            version: 2,
          } as unknown as Video['encryptionMetadata'],
        }),
        walletClient,
      })
    ).rejects.toThrow(/gate v1|v3/)

    expect(decryptAnyContentKey).not.toHaveBeenCalled()
    expect(fetchPinnedContent).not.toHaveBeenCalled()
  })
})
