/**
 * Haven-AOL chain vocabularies — one table, three spellings.
 *
 * Gates name chains three different ways across the stack:
 *   - Haven-AOL variant (`EthMainnet`, `BaseMainnet`, …) — inside gate JSON,
 *     the frozen Haven-AOL spelling;
 *   - EIP-155 id (`1`, `8453`, …) — the `gate_chain` attribute (ARKIV_FORMAT
 *     2.0.0; compact, range-queryable, one word instead of a 128 B slot);
 *   - Mint Club network key (`ethereum`, `base`, …) — mint.club / TrustWallet
 *     URLs in the drops UI.
 *
 * Writers store the EIP id; readers resolve back to the variant for gate
 * evaluation and to the network key for display URLs.
 *
 * Canonical chain list mirrors `haven-aol` `VALID_CHAINS`.
 *
 * @module lib/gate-chains
 */

/** Haven-AOL chain variant names (frozen Haven-AOL spelling). */
export const CHAIN_VARIANTS = [
  'EthMainnet',
  'EthSepolia',
  'ArbitrumOne',
  'BaseMainnet',
  'OptimismMainnet',
] as const

export type ChainVariant = (typeof CHAIN_VARIANTS)[number]

/** Haven-AOL variant → EIP-155 id (the `gate_chain` attribute spelling). */
export const VARIANT_TO_EIP155: Record<ChainVariant, number> = {
  EthMainnet: 1,
  EthSepolia: 11155111,
  ArbitrumOne: 42161,
  BaseMainnet: 8453,
  OptimismMainnet: 10,
}

/** EIP-155 id → Haven-AOL variant (reader resolution). */
export const EIP155_TO_VARIANT: Record<number, ChainVariant> = Object.fromEntries(
  (Object.entries(VARIANT_TO_EIP155) as Array<[ChainVariant, number]>).map(
    ([variant, id]) => [id, variant]
  )
) as Record<number, ChainVariant>

/** Haven-AOL variant → Mint Club / TrustWallet network key (display URLs). */
export const VARIANT_TO_NETWORK_KEY: Record<ChainVariant, string> = {
  EthMainnet: 'ethereum',
  EthSepolia: 'sepolia',
  ArbitrumOne: 'arbitrum',
  BaseMainnet: 'base',
  OptimismMainnet: 'optimism',
}

/** Resolve any chain spelling (variant name, EIP id, numeric string) to the variant. */
export function toChainVariant(raw: unknown): ChainVariant | undefined {
  if (typeof raw === 'number' && Number.isInteger(raw)) return EIP155_TO_VARIANT[raw]
  if (typeof raw === 'string') {
    if ((CHAIN_VARIANTS as readonly string[]).includes(raw)) return raw as ChainVariant
    const asInt = Number(raw)
    if (Number.isInteger(asInt)) return EIP155_TO_VARIANT[asInt]
  }
  return undefined
}

/** Resolve any chain spelling to the EIP-155 id writers store. */
export function toChainId(raw: unknown): number | undefined {
  const variant = toChainVariant(raw)
  return variant !== undefined ? VARIANT_TO_EIP155[variant] : undefined
}

/** Resolve any chain spelling to the Mint Club / TrustWallet network key. */
export function toNetworkKey(raw: unknown): string | undefined {
  const variant = toChainVariant(raw)
  return variant !== undefined ? VARIANT_TO_NETWORK_KEY[variant] : undefined
}
