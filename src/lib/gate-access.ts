/**
 * Gate access — the consumer side of Haven's access model.
 *
 * Arkiv stores what each archive requires (gate_token / gate_chain /
 * gate_threshold attributes stamped at publish time); the wallet's
 * `balanceOf` says what it holds. The overlap is the user's library.
 * This mirrors haven-mobile's `discoverGates` + `GateAccessChecker`
 * (core-arkiv / core-collections), which the web app never had: web
 * discovery was derived only from entities the wallet itself owns,
 * so a holder who never uploaded saw an empty library/communities.
 *
 * Read-only throughout: balances are public, no signature is involved.
 * A gate that cannot be read (unreachable RPC) is absent, not false —
 * an outage must not be rendered as "holds nothing".
 *
 * @module lib/gate-access
 */

import { createPublicClient, http, type PublicClient } from 'viem'
import { eq, or } from '@arkiv-network/sdk/query'
import type { PublicArkivClient } from '@arkiv-network/sdk'
import type { Transport, Chain } from 'viem'
import type { TokenGate } from '@/types/attestation'
import { toAttributeRecord } from './arkiv-attrs'
import { toChainVariant, VARIANT_TO_EIP155, type ChainVariant } from './gate-chains'

type ArkivClient = PublicArkivClient<Transport, Chain | undefined, undefined>

/** Groups whose entities carry gate attributes (mirrors mobile HAVEN_GROUPS_QUERY). */
export const GATE_GROUPS = [
  'haven.video.full',
  'haven.audio.full',
  'haven.video.drip.series',
  'haven.video.drip.part',
] as const

const PAGE_SIZE = 50
/** Safety bound, not a product limit: 200 pages × 50 = 10k entities per scan. */
export const MAX_DISCOVERY_PAGES = 200

/** Public RPC per EIP-155 chain id (same endpoints as lib/nft). */
export const CHAIN_RPC_URLS: Record<number, string> = {
  1: 'https://ethereum.publicnode.com',
  11155111: 'https://ethereum-sepolia-rpc.publicnode.com',
  8453: 'https://base-rpc.publicnode.com',
  42161: 'https://arbitrum-one-rpc.publicnode.com',
  10: 'https://optimism-rpc.publicnode.com',
}

const BALANCE_OF_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const
const DECIMALS_ABI = [
  { name: 'decimals', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
] as const

/** Stable identity for a gate: one chain variant, one contract. */
export function gateKey(gate: Pick<TokenGate, 'chain' | 'tokenAddress'>): string {
  return `${gate.chain}:${gate.tokenAddress.toLowerCase()}`
}

/**
 * Threshold in base units, mobile parity: ERC-20 thresholds are whole
 * tokens, so scale by `decimals()`; a contract with no `decimals()`
 * (ERC-721) is read as a count of items. Unknown decimals scale up
 * (fail closed) rather than letting dust clear a large gate.
 */
export function requiredUnits(threshold: number, decimals: number | null): bigint {
  const whole = BigInt(Math.max(0, Math.trunc(threshold)))
  if (decimals === null) return whole * 10n ** 18n
  if (decimals === 0) return whole
  return whole * 10n ** BigInt(decimals)
}

/** Lowest threshold per (chain, contract) — satisfying it opens the gate. */
export function dedupeGates(gates: TokenGate[]): TokenGate[] {
  const byKey = new Map<string, TokenGate>()
  for (const gate of gates) {
    if (!toChainVariant(gate.chain) || !gate.tokenAddress) continue
    const key = gateKey(gate)
    const prev = byKey.get(key)
    if (!prev || gate.threshold < prev.threshold) byKey.set(key, gate)
  }
  return [...byKey.values()]
}

/** Gates from raw Arkiv attribute records; exported for tests. */
export function gatesFromAttributes(records: Record<string, unknown>[]): TokenGate[] {
  const gates: TokenGate[] = []
  for (const attrs of records) {
    const token = attrs['gate_token']
    const chain = toChainVariant(attrs['gate_chain'])
    if (typeof token !== 'string' || !token || !chain) continue
    const threshold = attrs['gate_threshold']
    gates.push({
      tokenAddress: token,
      chain,
      threshold: typeof threshold === 'number' && threshold > 0 ? threshold : 1,
    })
  }
  return dedupeGates(gates)
}

/**
 * Every distinct gate recorded on Arkiv — the catalogue side of the
 * intersection. Pages until the cursor is exhausted (bounded only by
 * MAX_DISCOVERY_PAGES as a runaway guard).
 */
export async function discoverGates(client: ArkivClient): Promise<TokenGate[]> {
  const records: Record<string, unknown>[] = []
  let cursor: string | undefined
  for (let page = 0; page < MAX_DISCOVERY_PAGES; page++) {
    const builder = client
      .select({ key: true, attributes: true })
      .where([or(...GATE_GROUPS.map((g) => eq('grp', g)))])
      .limit(PAGE_SIZE)
    if (cursor) builder.cursor(cursor)
    const result = await builder.fetch()
    for (const entity of result.entities) {
      records.push(toAttributeRecord(entity.attributes))
    }
    cursor = result.cursor ?? undefined
    if (!cursor || result.entities.length === 0) break
  }
  return gatesFromAttributes(records)
}

const publicClients = new Map<number, PublicClient>()

function publicClient(chainId: number): PublicClient | null {
  const url = CHAIN_RPC_URLS[chainId]
  if (!url) return null
  let client = publicClients.get(chainId)
  if (!client) {
    client = createPublicClient({ transport: http(url) })
    publicClients.set(chainId, client)
  }
  return client
}

/** Injectable balance reader for tests; defaults to viem public clients. */
export interface GateBalanceReader {
  balanceOf(chainId: number, token: string, address: string): Promise<bigint | null>
  decimals(chainId: number, token: string): Promise<number | null>
}

export const viemGateBalanceReader: GateBalanceReader = {
  async balanceOf(chainId, token, address) {
    const client = publicClient(chainId)
    if (!client) return null
    try {
      return (await client.readContract({
        address: token as `0x${string}`,
        abi: BALANCE_OF_ABI,
        functionName: 'balanceOf',
        args: [address as `0x${string}`],
      })) as bigint
    } catch {
      return null
    }
  },
  async decimals(chainId, token) {
    const client = publicClient(chainId)
    if (!client) return null
    try {
      return Number(
        await client.readContract({
          address: token as `0x${string}`,
          abi: DECIMALS_ABI,
          functionName: 'decimals',
        })
      )
    } catch {
      return null
    }
  },
}

/**
 * The subset of `gates` this address satisfies, as gate keys.
 * One balance read per (chain, contract); chains run in parallel and
 * an unreachable chain only costs its own gates.
 */
export async function satisfiedGateKeys(
  address: string,
  gates: TokenGate[],
  reader: GateBalanceReader = viemGateBalanceReader
): Promise<Set<string>> {
  const satisfied = new Set<string>()
  if (!address || gates.length === 0) return satisfied
  const byChain = new Map<number, TokenGate[]>()
  for (const gate of dedupeGates(gates)) {
    const chainId = VARIANT_TO_EIP155[gate.chain as ChainVariant]
    if (chainId === undefined) continue
    const list = byChain.get(chainId) ?? []
    list.push(gate)
    byChain.set(chainId, list)
  }
  await Promise.all(
    [...byChain.entries()].map(async ([chainId, chainGates]) => {
      await Promise.all(
        chainGates.map(async (gate) => {
          const [balance, decimals] = await Promise.all([
            reader.balanceOf(chainId, gate.tokenAddress, address),
            reader.decimals(chainId, gate.tokenAddress),
          ])
          if (balance === null) return
          if (balance >= requiredUnits(gate.threshold, decimals)) {
            satisfied.add(gateKey(gate))
          }
        })
      )
    })
  )
  return satisfied
}

/** Live balance verdict for one gate — the community "membership" check. */
export async function checkGateAccess(
  address: string,
  gate: TokenGate,
  reader: GateBalanceReader = viemGateBalanceReader
): Promise<{ holds: boolean; balance: bigint | null; decimals: number | null }> {
  const keys = await satisfiedGateKeys(address, [gate], reader)
  const chainId = VARIANT_TO_EIP155[gate.chain as ChainVariant]
  if (chainId === undefined) return { holds: false, balance: null, decimals: null }
  const [balance, decimals] = await Promise.all([
    reader.balanceOf(chainId, gate.tokenAddress, address),
    reader.decimals(chainId, gate.tokenAddress),
  ])
  return { holds: keys.has(gateKey(gate)), balance, decimals }
}
