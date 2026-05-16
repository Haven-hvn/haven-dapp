/**
 * Unit tests for haven-aol-metadata.ts
 */

import { describe, it, expect } from 'vitest'
import {
  derivationThresholdFromAccessCondition,
  normalizeDerivationThreshold,
  normalizeGateMetadataForDerivation,
  toGateMetadataJson,
  resolveDerivationCid,
  normalizeChain,
  isHybridV1Metadata,
  isGateMetadata,
  parseEncryptionMetadata,
  type HybridV1EncryptionMetadata,
  type GateMetadataJson,
} from '../haven-aol-metadata'

const hybridV1NftGated = (): HybridV1EncryptionMetadata => ({
  version: 'hybrid-v1',
  encryptedKey: 'encrypted-key-b64',
  keyHash: 'key-hash',
  iv: 'iv-b64',
  chain: 'ethereum',
  accessControlConditions: [
    {
      contractAddress: '0xNFTContract',
      standardContractType: 'ERC721',
      chain: 'ethereum',
      method: 'balanceOf',
      parameters: [':userAddress'],
      returnValueTest: {
        comparator: '>',
        value: '0',
      },
    },
  ],
})

describe('normalizeDerivationThreshold', () => {
  it('clamps zero to one', () => {
    expect(normalizeDerivationThreshold('0')).toBe('1')
  })

  it('preserves values at or above one', () => {
    expect(normalizeDerivationThreshold('1')).toBe('1')
    expect(normalizeDerivationThreshold('5')).toBe('5')
  })

  it('clamps negative values to one', () => {
    expect(normalizeDerivationThreshold('-1')).toBe('1')
  })

  it('defaults invalid input to one', () => {
    expect(normalizeDerivationThreshold('')).toBe('1')
    expect(normalizeDerivationThreshold('abc')).toBe('1')
  })
})

describe('derivationThresholdFromAccessCondition', () => {
  it('maps nft_gated balanceOf > 0 to derivation threshold 1', () => {
    expect(
      derivationThresholdFromAccessCondition({ value: '0' })
    ).toBe('1')
  })

  it('uses one when returnValueTest is missing', () => {
    expect(derivationThresholdFromAccessCondition()).toBe('1')
    expect(derivationThresholdFromAccessCondition({})).toBe('1')
  })

  it('preserves explicit minimum balance thresholds', () => {
    expect(
      derivationThresholdFromAccessCondition({ value: '100' })
    ).toBe('100')
  })
})

describe('normalizeGateMetadataForDerivation', () => {
  const baseGate: GateMetadataJson = {
    version: 1,
    cid: 'bafytest',
    chain: 'EthMainnet',
    tokenAddress: '0xabc',
    threshold: '0',
    encryptedAesKey: 'key',
  }

  it('clamps threshold on gate metadata', () => {
    const normalized = normalizeGateMetadataForDerivation(baseGate)
    expect(normalized.threshold).toBe('1')
    expect(normalized.cid).toBe(baseGate.cid)
    expect(normalized.tokenAddress).toBe(baseGate.tokenAddress)
  })
})

describe('toGateMetadataJson', () => {
  it('uses derivation threshold 1 for nft_gated hybrid-v1 metadata', () => {
    const json = toGateMetadataJson(hybridV1NftGated(), 'bafyencrypted')
    const gate = JSON.parse(json) as GateMetadataJson

    expect(gate.threshold).toBe('1')
    expect(gate.tokenAddress).toBe('0xNFTContract')
    expect(gate.chain).toBe('EthMainnet')
    expect(gate.cid).toBe('bafyencrypted')
    expect(gate.encryptedAesKey).toBe('encrypted-key-b64')
    expect(gate.version).toBe(1)
  })

  it('throws when accessControlConditions are missing', () => {
    const meta = { ...hybridV1NftGated(), accessControlConditions: [] }
    expect(() => toGateMetadataJson(meta, 'bafy')).toThrow(
      'no accessControlConditions'
    )
  })

  it('throws when contractAddress is empty', () => {
    const meta = hybridV1NftGated()
    meta.accessControlConditions[0].contractAddress = ''
    expect(() => toGateMetadataJson(meta, 'bafy')).toThrow('empty contractAddress')
  })
})

describe('resolveDerivationCid', () => {
  it('prefers IPFS encrypted_cid', () => {
    expect(resolveDerivationCid('bafybeigtest', 'deadbeef')).toBe('bafybeigtest')
    expect(resolveDerivationCid('QmTest123', undefined)).toBe('QmTest123')
  })

  it('falls back to sha256 originalHash', () => {
    expect(resolveDerivationCid(undefined, 'abc123')).toBe('sha256:abc123')
  })

  it('throws when no valid CID source exists', () => {
    expect(() => resolveDerivationCid(undefined, undefined)).toThrow(
      'Cannot determine derivation CID'
    )
  })
})

describe('normalizeChain', () => {
  it('maps common aliases', () => {
    expect(normalizeChain('ethereum')).toBe('EthMainnet')
    expect(normalizeChain('sepolia')).toBe('EthSepolia')
  })

  it('throws for unknown chains', () => {
    expect(() => normalizeChain('unknown-chain-xyz')).toThrow(
      'Cannot normalize chain'
    )
  })
})

describe('metadata detection and parsing', () => {
  it('detects hybrid-v1 metadata', () => {
    expect(isHybridV1Metadata(hybridV1NftGated())).toBe(true)
    expect(isHybridV1Metadata(null)).toBe(false)
    expect(isHybridV1Metadata({ version: 'hybrid-v1' })).toBe(false)
  })

  it('detects gate metadata', () => {
    const gate: GateMetadataJson = {
      version: 1,
      cid: 'bafy',
      chain: 'EthMainnet',
      tokenAddress: '0x1',
      threshold: '1',
      encryptedAesKey: 'k',
    }
    expect(isGateMetadata(gate)).toBe(true)
    expect(isGateMetadata({ version: 1 })).toBe(false)
  })

  it('parseEncryptionMetadata handles string and object forms', () => {
    const meta = hybridV1NftGated()
    expect(parseEncryptionMetadata(meta)).toEqual(meta)
    expect(parseEncryptionMetadata(JSON.stringify(meta))).toEqual(meta)
    expect(parseEncryptionMetadata('not-json')).toBeNull()
    expect(parseEncryptionMetadata(null)).toBeNull()
  })
})
