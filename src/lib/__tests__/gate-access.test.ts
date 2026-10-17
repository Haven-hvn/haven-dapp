/**
 * Gate access tests — the holder-not-uploader persona.
 *
 * A pure consumer owns no Arkiv entities: discovery must come from gate
 * attributes recorded by other people's uploads, and access from the
 * wallet's balances. These tests pin that intersection.
 */

import { describe, it, expect } from 'vitest'
import {
  gatesFromAttributes,
  dedupeGates,
  requiredUnits,
  satisfiedGateKeys,
  gateKey,
  type GateBalanceReader,
} from '../gate-access'
import type { TokenGate } from '@/types/attestation'

const HOLDER = '0x2222222222222222222222222222222222222222'
const TOKEN = '0x6982508145454ce325ddbe47a25d4ec3d2311933'

function reader(balances: Map<string, bigint>, decimals = 18): GateBalanceReader {
  return {
    balanceOf: async (_chainId, token) => balances.get(token.toLowerCase()) ?? null,
    decimals: async () => decimals,
  }
}

describe('gatesFromAttributes', () => {
  it('discovers gates from other uploaders’ entities', () => {
    const gates = gatesFromAttributes([
      { gate_token: TOKEN, gate_chain: 8453, gate_threshold: 25 },
      { gate_token: TOKEN, gate_chain: 'BaseMainnet', gate_threshold: 100 },
      { title: 'ungated' },
      { gate_token: '', gate_chain: 1 },
    ])
    // Deduped to the lowest threshold for the one real gate.
    expect(gates).toEqual([{ tokenAddress: TOKEN, chain: 'BaseMainnet', threshold: 25 }])
  })
})

describe('requiredUnits', () => {
  it('scales ERC-20 thresholds by decimals', () => {
    expect(requiredUnits(25, 18)).toBe(25n * 10n ** 18n)
  })
  it('reads NFT thresholds as item counts (no decimals)', () => {
    expect(requiredUnits(1, 0)).toBe(1n)
  })
  it('fails closed when decimals are unknown', () => {
    expect(requiredUnits(1, null)).toBe(10n ** 18n)
  })
})

describe('satisfiedGateKeys — holder who never uploaded', () => {
  const gate: TokenGate = { tokenAddress: TOKEN, chain: 'BaseMainnet', threshold: 25 }

  it('satisfies the gate from balance alone', async () => {
    const balances = new Map([[TOKEN, 30n * 10n ** 18n]])
    const keys = await satisfiedGateKeys(HOLDER, [gate], reader(balances))
    expect(keys.has(gateKey(gate))).toBe(true)
  })

  it('does not satisfy below threshold', async () => {
    const balances = new Map([[TOKEN, 24n * 10n ** 18n]])
    const keys = await satisfiedGateKeys(HOLDER, [gate], reader(balances))
    expect(keys.size).toBe(0)
  })

  it('treats an unreadable balance as absent, not unsatisfied-by-proof', async () => {
    const keys = await satisfiedGateKeys(HOLDER, [gate], reader(new Map()))
    expect(keys.size).toBe(0)
  })
})

describe('dedupeGates', () => {
  it('keeps the lowest threshold per chain+contract', () => {
    const gates = dedupeGates([
      { tokenAddress: TOKEN, chain: 'BaseMainnet', threshold: 100 },
      { tokenAddress: TOKEN.toUpperCase(), chain: 'BaseMainnet', threshold: 5 },
      { tokenAddress: TOKEN, chain: 'EthMainnet', threshold: 7 },
    ])
    expect(gates).toHaveLength(2)
    expect(gates.find((g) => g.chain === 'BaseMainnet')?.threshold).toBe(5)
  })
})
