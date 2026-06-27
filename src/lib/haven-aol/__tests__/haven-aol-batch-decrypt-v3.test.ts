/**
 * Vitest — Sprint 5 — v3 batch decrypt.
 *
 * Pins the v3-specific batch contract: a single recovered VetKey serves
 * every CID in the batch. With the gate-key cache warm, the canister
 * round-trip is skipped entirely.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

const SAMPLE_TOKEN = '0x1234567890abcdef1234567890abcdef12345678'

let canisterCalls = 0
let ibeCalls = 0

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
    recoverVetKey: vi.fn(() => MockVk.deserialize(new Uint8Array([1, 2, 3]))),
    ibeDecryptAesKey: vi.fn(() => {
      ibeCalls++
      return new Uint8Array([9, 9, 9])
    }),
    computeDerivationInputV3: vi.fn(async () => new Uint8Array(32)),
    buildGateRequestV3TypedData: vi.fn(() => ({ domain: {}, primaryType: 'X', types: {}, message: {} })),
    createTransportKeyPair: vi.fn(() => ({ secretKey: new Uint8Array(32), publicKey: new Uint8Array(32) })),
    parseSignatureHex: vi.fn(() => new Uint8Array(65)),
    GATE_METADATA_VERSION_V3: 3 as const,
    parseGateMetadataV3: vi.fn(),
    isGateMetadataV3: vi.fn(),
    VALID_CHAINS: ['EthMainnet', 'EthSepolia', 'ArbitrumOne', 'BaseMainnet', 'OptimismMainnet'] as const,
  }
})

vi.mock('../haven-aol-client', () => ({
  getHavenAolConfig: () => ({
    host: 'https://test', canisterId: 'c', eip712ChainId: 1n,
    eip712VerifyingContract: '0x' + '0'.repeat(39) + '1', fetchRootKey: false,
  }),
  getOrCreateAgent: vi.fn(async () => ({}) as unknown),
  requestDecryptionKeyV3: vi.fn(async () => {
    canisterCalls++
    return {
      ok: {
        encryptedKey: new Uint8Array([1]),
        verificationKey: new Uint8Array([2]),
      },
    }
  }),
}))

vi.mock('../haven-aol-auth', () => ({
  createSignedGateRequestV3: vi.fn(async (_w: unknown, epoch: bigint) => ({
    transportSecretKey: new Uint8Array(32),
    transportPublicKey: new Uint8Array(32),
    epoch, nonce: 1n, signature: new Uint8Array(65),
    eip712ChainId: 1n,
    eip712VerifyingContract: '0x' + '0'.repeat(39) + '1',
  })),
}))

vi.mock('../../aes-key-cache', () => ({
  getCachedKey: vi.fn(() => null),
  setCachedKey: vi.fn(),
  hasCachedKey: vi.fn(() => false),
  getVideoIdFromMetadata: vi.fn(() => null),
}))

import { batchDecryptContentKeysV3 } from '../haven-aol-batch-decrypt-v3'
import { clearV3VetKeyCache } from '../haven-aol-v3-cache'

const wallet = {
  account: { address: '0xABCDef1234567890abcDEF1234567890ABCDeF12' },
  signTypedData: vi.fn(async () => '0x' + '00'.repeat(65)),
}

function v3Video(id: string, cid: string, epoch: number) {
  return {
    id,
    title: `Video ${id}`,
    encryptionMetadata: {
      version: 3,
      cid,
      chain: 'EthMainnet',
      tokenAddress: SAMPLE_TOKEN,
      threshold: '1',
      epoch,
      encryptedAesKey: `enc-${id}`,
    },
  } as unknown as Parameters<typeof batchDecryptContentKeysV3>[0][number]
}

beforeEach(() => {
  canisterCalls = 0
  ibeCalls = 0
  clearV3VetKeyCache()
})

describe('batchDecryptContentKeysV3 — v3-specific contract', () => {
  it('three CIDs in one (community, epoch) → ONE canister call + 3 IBE-decrypts', async () => {
    const videos = [
      v3Video('a', 'bafyA', 100),
      v3Video('b', 'bafyB', 100),
      v3Video('c', 'bafyC', 100),
    ]
    const result = await batchDecryptContentKeysV3(videos, wallet)
    expect(canisterCalls).toBe(1)
    expect(ibeCalls).toBe(3)
    expect(result.derivedCount).toBe(3)
    expect(result.keys.size).toBe(3)
  })

  it('rejects mixed (community, epoch) — caller must group by gate', async () => {
    const videos = [v3Video('a', 'bafyA', 100), v3Video('b', 'bafyB', 200)]
    await expect(batchDecryptContentKeysV3(videos, wallet)).rejects.toThrow(
      /same \(chain, tokenAddress, threshold, epoch\)/,
    )
  })

  it('second call with same gate but new CIDs is ZERO canister calls', async () => {
    await batchDecryptContentKeysV3(
      [v3Video('a', 'bafyA', 100), v3Video('b', 'bafyB', 100)],
      wallet,
    )
    canisterCalls = 0
    ibeCalls = 0
    const result = await batchDecryptContentKeysV3(
      [v3Video('c', 'bafyC', 100), v3Video('d', 'bafyD', 100)],
      wallet,
    )
    expect(canisterCalls).toBe(0)
    expect(ibeCalls).toBe(2)
    expect(result.fromGateKeyCache).toBe(true)
  })
})
