/**
 * Unit tests for haven-aol-metadata.ts (gate v1 only)
 */

import { describe, it, expect } from 'vitest'
import {
  GATE_METADATA_VERSION,
  normalizeDerivationThreshold,
  normalizeGateMetadataForDerivation,
  resolveDerivationCid,
  normalizeChain,
  isGateMetadata,
  parseGateMetadata,
  parseCidEncryptionMetadata,
  type GateMetadataJson,
} from '../haven-aol-metadata'

function sampleGate(overrides: Partial<GateMetadataJson> = {}): GateMetadataJson {
  return {
    version: GATE_METADATA_VERSION,
    cid: 'bafyencrypted',
    chain: 'EthMainnet',
    tokenAddress: '0xNFTContract00000000000000000000000001',
    threshold: '1',
    encryptedAesKey: 'encrypted-key-b64',
    ...overrides,
  }
}

describe('normalizeDerivationThreshold', () => {
  it('clamps zero to one', () => {
    expect(normalizeDerivationThreshold('0')).toBe('1')
  })

  it('preserves values at or above one', () => {
    expect(normalizeDerivationThreshold('1')).toBe('1')
    expect(normalizeDerivationThreshold('5')).toBe('5')
  })
})

describe('normalizeGateMetadataForDerivation', () => {
  it('clamps threshold on gate metadata', () => {
    const normalized = normalizeGateMetadataForDerivation(
      sampleGate({ threshold: '0' })
    )
    expect(normalized.threshold).toBe('1')
  })
})

describe('resolveDerivationCid', () => {
  it('prefers IPFS encrypted_cid', () => {
    expect(resolveDerivationCid('bafytest', 'hash')).toBe('bafytest')
  })

  it('falls back to sha256 original hash', () => {
    expect(resolveDerivationCid(undefined, 'abc123')).toBe('sha256:abc123')
  })

  it('throws when no derivation input', () => {
    expect(() => resolveDerivationCid()).toThrow('Cannot determine derivation CID')
  })
})

describe('normalizeChain', () => {
  it('normalizes ethereum aliases', () => {
    expect(normalizeChain('ethereum')).toBe('EthMainnet')
    expect(normalizeChain('EthMainnet')).toBe('EthMainnet')
  })

  it('throws for unknown chain', () => {
    expect(() => normalizeChain('unknown-chain')).toThrow('Cannot normalize chain')
  })
})

describe('isGateMetadata', () => {
  it('detects valid gate metadata', () => {
    expect(isGateMetadata(sampleGate())).toBe(true)
    expect(isGateMetadata({ version: 1 })).toBe(false)
  })

  it('rejects hybrid-v1 legacy format', () => {
    expect(
      isGateMetadata({
        version: 'hybrid-v1',
        encryptedKey: 'x',
        keyHash: 'y',
        accessControlConditions: [],
        chain: 'ethereum',
      })
    ).toBe(false)
  })
})

describe('parseGateMetadata', () => {
  it('parses object and JSON string forms', () => {
    const gate = sampleGate()
    expect(parseGateMetadata(gate)).toEqual(gate)
    expect(parseGateMetadata(JSON.stringify(gate))).toEqual(gate)
    expect(parseGateMetadata('not-json')).toBeNull()
    expect(parseGateMetadata(null)).toBeNull()
  })

  it('parseCidEncryptionMetadata is an alias', () => {
    const gate = sampleGate({ cid: 'QmCidLayer' })
    expect(parseCidEncryptionMetadata(gate)).toEqual(gate)
  })
})
