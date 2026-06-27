/**
 * Vitest — Sprint 5 — v3 decrypt + prefetch behavior.
 *
 * Mocks the SDK + canister + auth modules at the import boundary so this
 * suite exercises ONLY the decrypt orchestrator's wiring:
 *
 *   1. v3 cache hit short-circuits — zero canister calls on the second
 *      decrypt of the same `(community, epoch)`.
 *   2. Cache lookup ignores `Date.now()` — entry put at metadata.epoch=100
 *      still hits after Date.now() jumps to a future epoch (proposal
 *      §1.7 scenario D, KDD #7).
 *   3. Batch decrypt populates the cache once and IBE-decrypts every CID
 *      off the same VetKey.
 *
 * The mocks return deterministic-but-fake bytes; we test routing and
 * cache behavior, not real cryptography. Real crypto is tested in the
 * SDK suite (`packages/typescript/src/test/v3.test.ts`).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { GateMetadataV3Json } from '../haven-aol-metadata'

const SAMPLE_TOKEN = '0x1234567890abcdef1234567890abcdef12345678'
const FAKE_VETKEY = new Uint8Array([0xff, 0xee, 0xdd, 0xcc])
const FAKE_ENC_KEY = new Uint8Array([1, 2, 3, 4])
const FAKE_VERIFY_KEY = new Uint8Array([5, 6, 7, 8])

// --- Mock counters ---
let canisterCalls = 0
let recoverCalls = 0
let ibeDecryptCalls = 0

// ---------------------------------------------------------------------------
// Mock @dfinity/vetkeys so the gate-key cache can deserialize VetKeys.
// ---------------------------------------------------------------------------
vi.mock('@dfinity/vetkeys', () => {
  class MockVk {
    readonly #b: Uint8Array
    constructor(b: Uint8Array) { this.#b = b }
    serialize(): Uint8Array { return new Uint8Array(this.#b) }
    static deserialize(b: Uint8Array): MockVk { return new MockVk(b) }
  }
  return { VetKey: MockVk }
})

// ---------------------------------------------------------------------------
// Mock haven-aol — returns a serializable mock VetKey.
// ---------------------------------------------------------------------------
vi.mock('haven-aol', () => {
  class MockVk {
    readonly #b: Uint8Array
    constructor(b: Uint8Array) { this.#b = b }
    serialize(): Uint8Array { return new Uint8Array(this.#b) }
    static deserialize(b: Uint8Array): MockVk { return new MockVk(b) }
  }
  return {
    recoverVetKey: vi.fn((_enc, _sk, _vk, _input) => {
      recoverCalls++
      return MockVk.deserialize(FAKE_VETKEY)
    }),
    ibeDecryptAesKey: vi.fn((_enc, _vetKey) => {
      ibeDecryptCalls++
      return new Uint8Array([0xAA, 0xBB, 0xCC, 0xDD]) // fake AES key
    }),
    computeDerivationInputV3: vi.fn(async () => new Uint8Array(32)),
    buildGateRequestV3TypedData: vi.fn(() => ({
      domain: {},
      primaryType: 'GateRequestV3',
      types: {},
      message: {},
    })),
    createTransportKeyPair: vi.fn(() => ({
      secretKey: new Uint8Array(32),
      publicKey: new Uint8Array(32),
    })),
    parseSignatureHex: vi.fn(() => new Uint8Array(65)),
    GATE_METADATA_VERSION_V3: 3 as const,
    currentEpoch: vi.fn(() => 9999),
    parseGateMetadataV3: vi.fn((x: unknown) => (x && typeof x === 'object' && (x as { version?: number }).version === 3 ? x : null)),
    isGateMetadataV3: vi.fn((x: unknown) => x !== null && typeof x === 'object' && (x as { version?: number }).version === 3),
    VALID_CHAINS: ['EthMainnet', 'EthSepolia', 'ArbitrumOne', 'BaseMainnet', 'OptimismMainnet'] as const,
  }
})

vi.mock('../haven-aol-client', () => ({
  getHavenAolConfig: () => ({
    host: 'https://test',
    canisterId: 'test-canister',
    eip712ChainId: 1n,
    eip712VerifyingContract: '0x0000000000000000000000000000000000000001',
    fetchRootKey: false,
  }),
  getOrCreateAgent: vi.fn(async () => ({}) as unknown),
  requestDecryptionKeyV3: vi.fn(async () => {
    canisterCalls++
    return {
      ok: {
        encryptedKey: new Uint8Array(FAKE_ENC_KEY),
        verificationKey: new Uint8Array(FAKE_VERIFY_KEY),
      },
    }
  }),
  batchRequestDecryptionKeyV3: vi.fn(async () => ({
    ok: { keys: [], verificationKey: new Uint8Array(FAKE_VERIFY_KEY) },
  })),
}))

vi.mock('../haven-aol-auth', () => ({
  createSignedGateRequestV3: vi.fn(async (_w: unknown, epoch: bigint) => ({
    transportSecretKey: new Uint8Array(32),
    transportPublicKey: new Uint8Array(32),
    epoch,
    nonce: 42n,
    signature: new Uint8Array(65),
    eip712ChainId: 1n,
    eip712VerifyingContract: '0x0000000000000000000000000000000000000001',
  })),
  retryWithFreshV3GateNonce: vi.fn(),
}))

vi.mock('../../aes-key-cache', () => ({
  getCachedKey: vi.fn(() => null),
  setCachedKey: vi.fn(),
  hasCachedKey: vi.fn(() => false),
  getVideoIdFromMetadata: vi.fn(() => 'video-1'),
}))

// Import AFTER mocks are declared.
import { decryptContentKeyV3, prefetchGateKeyV3 } from '../haven-aol-decrypt-v3'
import { GateKeyCache } from '../haven-aol-gate-key-cache'
import { clearV3VetKeyCache, v3VetKeyHas } from '../haven-aol-v3-cache'

const wallet = {
  account: { address: '0xABCDef1234567890abcDEF1234567890ABCDeF12' },
  signTypedData: vi.fn(async () => '0x' + '00'.repeat(65)),
}

function meta(epoch: number, encryptedAesKey: string = 'enc-key-1'): GateMetadataV3Json {
  return {
    version: 3,
    cid: 'bafyabc',
    chain: 'EthMainnet',
    tokenAddress: SAMPLE_TOKEN,
    threshold: '1',
    epoch,
    encryptedAesKey,
  }
}

beforeEach(() => {
  canisterCalls = 0
  recoverCalls = 0
  ibeDecryptCalls = 0
  clearV3VetKeyCache()
})

describe('decryptContentKeyV3 — cache + canister wiring', () => {
  it('first decrypt makes ONE canister call and populates the gate-key cache', async () => {
    const m = meta(100)
    const result = await decryptContentKeyV3({
      encryptionMetadata: m,
      walletClient: wallet,
    })
    expect(canisterCalls).toBe(1)
    expect(recoverCalls).toBe(1)
    expect(ibeDecryptCalls).toBe(1)
    expect(result.fromAesCache).toBe(false)
    expect(result.fromGateKeyCache).toBe(false)
    // Cache populated under the metadata.epoch.
    const key = GateKeyCache.makeKey({
      chain: 'EthMainnet',
      tokenAddress: SAMPLE_TOKEN,
      threshold: '1',
      epoch: 100,
    })
    expect(v3VetKeyHas(key)).toBe(true)
  })

  it('second decrypt of same (community, epoch) is ZERO canister calls', async () => {
    await decryptContentKeyV3({ encryptionMetadata: meta(100), walletClient: wallet })
    canisterCalls = 0
    recoverCalls = 0
    ibeDecryptCalls = 0

    const result = await decryptContentKeyV3({
      encryptionMetadata: meta(100, 'enc-key-2'), // different CID, same gate
      walletClient: wallet,
    })
    expect(canisterCalls).toBe(0)
    expect(recoverCalls).toBe(0)
    expect(ibeDecryptCalls).toBe(1) // IBE still runs per CID
    expect(result.fromGateKeyCache).toBe(true)
  })

  it('different epochs miss the cache independently', async () => {
    await decryptContentKeyV3({ encryptionMetadata: meta(100), walletClient: wallet })
    canisterCalls = 0
    await decryptContentKeyV3({ encryptionMetadata: meta(101), walletClient: wallet })
    expect(canisterCalls).toBe(1)
  })
})

describe('Cache lookup ignores Date.now() — proposal §1.7 scenario (D)', () => {
  it('entry put at metadata.epoch=100 still hits after Date.now() jumps far ahead', async () => {
    await decryptContentKeyV3({ encryptionMetadata: meta(100), walletClient: wallet })
    canisterCalls = 0

    // Move the clock decades forward.
    const originalNow = Date.now
    Date.now = () => Number.MAX_SAFE_INTEGER
    try {
      const result = await decryptContentKeyV3({
        encryptionMetadata: meta(100, 'enc-key-2'), // SAME metadata.epoch
        walletClient: wallet,
      })
      expect(canisterCalls).toBe(0)
      expect(result.fromGateKeyCache).toBe(true)
    } finally {
      Date.now = originalNow
    }
  })
})

describe('prefetchGateKeyV3 — best-effort pre-warm', () => {
  it('populates the cache on success', async () => {
    const ok = await prefetchGateKeyV3({
      cacheKey: {
        chain: 'EthMainnet',
        tokenAddress: SAMPLE_TOKEN,
        threshold: 1n,
        epoch: 100n,
      },
      walletClient: wallet,
    })
    expect(ok).toBe(true)
    const key = GateKeyCache.makeKey({
      chain: 'EthMainnet',
      tokenAddress: SAMPLE_TOKEN,
      threshold: 1n,
      epoch: 100n,
    })
    expect(v3VetKeyHas(key)).toBe(true)
  })

  it('returns true without re-fetching when cache already warm', async () => {
    await prefetchGateKeyV3({
      cacheKey: {
        chain: 'EthMainnet',
        tokenAddress: SAMPLE_TOKEN,
        threshold: 1n,
        epoch: 100n,
      },
      walletClient: wallet,
    })
    canisterCalls = 0
    const ok = await prefetchGateKeyV3({
      cacheKey: {
        chain: 'EthMainnet',
        tokenAddress: SAMPLE_TOKEN,
        threshold: 1n,
        epoch: 100n,
      },
      walletClient: wallet,
    })
    expect(ok).toBe(true)
    expect(canisterCalls).toBe(0)
  })
})
