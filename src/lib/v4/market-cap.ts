/**
 * V4 live market cap via Mint Club bonding curves.
 *
 * The gate token of a drip is expected to be a Mint Club V2 bonding-curve
 * token. Its market cap is computed the same way everywhere (publisher
 * preview AND reader lock screen) so both sides agree on unlock state:
 *
 *   marketCapUsd = currentSupply(human) × usdRate
 *
 * where `usdRate` resolves through the reserve token's own USD rate
 * (nested bonds recurse; plain reserves go through 1inch/DefiLlama).
 *
 * The SDK import is dynamic: it pulls viem contract tables and only runs in
 * the browser, so keeping it lazy keeps SSR and first load lean.
 *
 * @module lib/v4/market-cap
 */

// ============================================================================
// Types
// ============================================================================

export interface MarketCapQuery {
  /** Mint Club network key ('base', 'ethereum', …). Defaults to 'base'. */
  network?: string
  /**
   * Gate token as an address (`0x…`) or a Mint Club symbol (resolved to its
   * CREATE2 address by the SDK).
   */
  token: string
}

export interface MarketCapResult {
  /** Whole-USD market cap, or null when it cannot be computed right now. */
  marketCapUsd: number | null
  /** USD price per token (informational). */
  priceUsd: number | null
  /** Circulating supply in human units. */
  supply: number | null
  /** Resolved token symbol (from bond detail when available). */
  symbol: string | null
  /** Resolved token address. */
  address: string | null
}

// ============================================================================
// Bond contract lookup
// ============================================================================

/** Mint Club network key -> canonical bond contract (inside the v4 gate JSON). */
const BOND_ADDRESS_HINTS: Record<string, string> = {
  base: '0xc5a076cad94176c2996B32d8466Be1cE757FAa27',
  ethereum: '0xc5a076cad94176c2996B32d8466Be1cE757FAa27',
}

type MintClubModule = typeof import('@mint.club/v2-sdk')

let mintClubPromise: Promise<MintClubModule> | null = null

/** Lazy-load the Mint Club SDK singleton (browser only). */
async function loadMintClub(): Promise<MintClubModule> {
  if (!mintClubPromise) {
    mintClubPromise = import('@mint.club/v2-sdk')
  }
  return mintClubPromise
}

/**
 * Best-effort bond contract address for a Mint Club network.
 * Resolves through the SDK's own registry (network key -> chain id -> BOND
 * address); falls back to pinned hints when the SDK cannot be loaded.
 */
export async function getBondContractAddress(
  network: string = 'base'
): Promise<string | null> {
  try {
    const sdk = await loadMintClub()
    const mod = sdk as unknown as {
      supportedChainsMap?: Record<string, number>
      getMintClubContractAddress?: (name: string, chainId: number) => string
    }
    const chainId = mod.supportedChainsMap?.[network.toLowerCase()]
    if (chainId != null && mod.getMintClubContractAddress) {
      return mod.getMintClubContractAddress('BOND', chainId)
    }
  } catch {
    // fall through to hints
  }
  return BOND_ADDRESS_HINTS[network.toLowerCase()] ?? null
}

/**
 * Resolve a symbol-or-address to a concrete token record.
 * Returns `exists: false` (without throwing) for unknown symbols.
 */
export async function resolveMintToken(
  query: MarketCapQuery
): Promise<{ address: string | null; symbol: string | null; exists: boolean }> {
  const { token } = query
  if (!token || token.trim().length === 0) {
    return { address: null, symbol: null, exists: false }
  }

  const { mintclub } = await loadMintClub()
  const network = query.network ?? 'base'
  const networkKey = network as Parameters<typeof mintclub.network>[0]
  const handle = mintclub.network(networkKey).token(token.trim())

  try {
    const [address, exists] = await Promise.all([
      handle.getTokenAddress(),
      handle.exists(),
    ])
    if (!exists) {
      return { address: null, symbol: null, exists: false }
    }
    let symbol: string | null = null
    try {
      symbol = await handle.getSymbol()
    } catch {
      symbol = null
    }
    return { address, symbol, exists: true }
  } catch {
    return { address: null, symbol: null, exists: false }
  }
}

// ============================================================================
// Market cap
// ============================================================================

/**
 * Fetch the live USD market cap for a gate token.
 *
 * Degrades gracefully: every failure mode resolves to `{ marketCapUsd: null }`
 * rather than throwing, because the lock UI must render even while the price
 * oracle path is down.
 */
export async function fetchTokenMarketCap(
  query: MarketCapQuery
): Promise<MarketCapResult> {
  const empty: MarketCapResult = {
    marketCapUsd: null,
    priceUsd: null,
    supply: null,
    symbol: null,
    address: null,
  }

  if (!query.token || query.token.trim().length === 0) return empty

  try {
    const { mintclub } = await loadMintClub()
    const network = query.network ?? 'base'
    const networkKey = network as Parameters<typeof mintclub.network>[0]
    const token = mintclub.network(networkKey).token(query.token.trim())

    // getDetail() → { info: { currentSupply (raw), decimals, symbol }, steps }
    // getUsdRate() → { usdRate, reserveToken, path }
    const [detail, usd] = await Promise.all([
      token.getDetail() as Promise<{
        info: { currentSupply: bigint; decimals: number; symbol: string }
      }>,
      token.getUsdRate() as Promise<{ usdRate: number }>,
    ])

    const info = detail?.info
    if (!info) return empty

    const supply = Number(info.currentSupply) / 10 ** info.decimals
    const priceUsd = Number.isFinite(usd?.usdRate) ? usd.usdRate : null

    return {
      marketCapUsd: priceUsd != null ? supply * priceUsd : null,
      priceUsd,
      supply,
      symbol: info.symbol ?? null,
      address: null,
    }
  } catch {
    return empty
  }
}
