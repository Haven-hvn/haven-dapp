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

/**
 * Mint Club network key -> canonical Bond contract.
 * Mainnet Bond is CREATE2-deployed (same address everywhere); Sepolia uses
 * the separate testnet deployment — both from the @mint.club/v2-sdk BOND
 * registry (`getMintClubContractAddress`), which `getBondContractAddress`
 * consults first. These hints are the offline fallback, so they must track
 * the registry per network, not as one global.
 */
const BOND_ADDRESS_HINTS: Record<string, string> = {
  base: '0xc5a076cad94176c2996B32d8466Be1cE757FAa27',
  ethereum: '0xc5a076cad94176c2996B32d8466Be1cE757FAa27',
  arbitrum: '0xc5a076cad94176c2996B32d8466Be1cE757FAa27',
  optimism: '0xc5a076cad94176c2996B32d8466Be1cE757FAa27',
  sepolia: '0x8dce343A86Aa950d539eeE0e166AFfd0Ef515C0c',
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
 * Mint Club network key -> wrapped-native (WETH) reserve token.
 * Mirrors the canister's compiled-in Bond defaults
 * (`haven-aol/src/backend/main.mo`, `getBondConfigInternal`): the wizard
 * mints with the zero-address (native) reserve and WETH is its wrapped alias.
 * Networks absent here yield an unknown (`null`) native-reserve verdict —
 * callers must treat that as "cannot verify", never as proof either way.
 */
const WRAPPED_NATIVE: Record<string, string> = {
  ethereum: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  base: '0x4200000000000000000000000000000000000006',
  arbitrum: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
  optimism: '0x4200000000000000000000000000000000000006',
  sepolia: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
}

/**
 * WETH on Ethereum mainnet — the deepest reserve-rate path in the SDK.
 * ETH is ETH on every chain, so one rate serves all networks; there is no
 * per-network map because there is nothing per-network about this number.
 */
const ETH_USD_RESERVE = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'

/**
 * Live WETH/USD rate for seal-time USD→ETH conversion and dual display.
 *
 * Resolves through the SDK's own reserve-rate path (same source the
 * market-cap preview uses), so the wizard's conversion agrees with the
 * preview by construction. Null when unavailable — callers must block
 * sealing (fail closed), never guess a rate.
 */
export async function fetchEthUsd(): Promise<number | null> {
  try {
    const { mintclub } = await loadMintClub()
    const handle = mintclub.network('ethereum').token(ETH_USD_RESERVE)
    const usd = (await handle.getUsdRate()) as { usdRate?: number }
    return typeof usd?.usdRate === 'number' && Number.isFinite(usd.usdRate) && usd.usdRate > 0
      ? usd.usdRate
      : null
  } catch {
    return null
  }
}

/**
 * Sync Bond check over the pinned hints (any casing). The async
 * `getBondContractAddress` consults the live SDK registry first; this is
 * the offline equivalent for parse paths that cannot await. A future
 * chain with a novel Bond address returns false here until the hints
 * table tracks it — callers must treat false as "unknown", never as
 * proof of non-Bond.
 */
export function isKnownBondAddress(addr: string): boolean {
  const lower = addr.trim().toLowerCase()
  if (!lower) return false
  return Object.values(BOND_ADDRESS_HINTS).some((h) => h.toLowerCase() === lower)
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
 * Curve ceiling for a gate token: the highest market cap its bonding curve
 * can ever report (`maxSupply × finalPrice`). Sealed rungs above this can
 * never unlock — minting stops at max supply while `priceForNextMint` sticks
 * at the final step price, so the product flatlines.
 */
export interface TokenCeiling {
  /** Whole reserve units (integer) — directly comparable to sealed targets. Null when unknown. */
  ceilingReserveWhole: number | null
  /** Human reserve units (float, display only). Null when unknown. */
  ceilingReserve: number | null
  /** Whole-USD approximation via the live reserve rate. Null when unknown. */
  ceilingUsd: number | null
  /** Bond reserve token address (`0x…`), if reported. */
  reserveAddress: string | null
  /**
   * Whether the reserve is the network's wrapped native. Null when it cannot
   * be determined (unknown network mapping or unreported reserve). Callers
   * should only enforce the ceiling when this is not `false` — a non-native
   * reserve fails closed canister-side with its own error.
   */
  isNativeReserve: boolean | null
}

function toBigint(value: unknown): bigint | null {
  if (typeof value === 'bigint') return value
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return BigInt(value)
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    try {
      return BigInt(value.trim())
    } catch {
      return null
    }
  }
  return null
}

function toSafeInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 36) return value
  const b = toBigint(value)
  if (b == null || b > 36n) return null
  return Number(b)
}

/**
 * Pure ceiling math over a `getDetail()`-shaped payload — exported for tests.
 * `currentUsdRate` is the live `getUsdRate().usdRate` (or null); it is only
 * used to derive the USD approximation, never the reserve ceiling.
 */
export function computeTokenCeiling(
  detail: unknown,
  currentUsdRate: number | null
): Pick<TokenCeiling, 'ceilingReserveWhole' | 'ceilingReserve' | 'ceilingUsd'> {
  const none = { ceilingReserveWhole: null, ceilingReserve: null, ceilingUsd: null }
  if (!detail || typeof detail !== 'object') return none
  const d = detail as Record<string, unknown>
  const rawInfo = d.info ?? (Array.isArray(detail) ? detail[0] : undefined)
  if (!rawInfo || typeof rawInfo !== 'object') return none
  const info = rawInfo as Record<string, unknown>

  const maxSupply = toBigint(info.maxSupply)
  const currentPrice = toBigint(info.priceForNextMint)
  const decimals = toSafeInt(info.decimals)
  const reserveDecimals = toSafeInt(info.reserveDecimals)
  if (maxSupply == null || decimals == null || reserveDecimals == null) return none

  const rawSteps = (info as { steps?: unknown }).steps ?? d.steps ?? (Array.isArray(detail) ? detail[1] : undefined)
  let finalPrice = toBigint(info.priceForNextMint)
  if (Array.isArray(rawSteps) && rawSteps.length > 0) {
    const last = rawSteps[rawSteps.length - 1] as Record<string, unknown> | bigint | number | string
    const lastPrice =
      last != null && typeof last === 'object'
        ? ((last as Record<string, unknown>).price ?? (Array.isArray(last) ? last[1] : undefined))
        : last
    finalPrice = toBigint(lastPrice) ?? finalPrice
  }
  if (finalPrice == null || finalPrice <= 0n || maxSupply <= 0n) return none

  // Whole-unit ceiling with BigInt precision: comparable to sealed targets.
  const scale = 10n ** BigInt(decimals) * 10n ** BigInt(reserveDecimals)
  const whole = (maxSupply * finalPrice) / scale
  const ceilingReserveWhole =
    whole <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(whole) : null

  // Float leg for display only (precision loss is acceptable here —
  // enforcement uses the BigInt whole-unit ceiling above).
  const ceilingReserve = (Number(maxSupply) / 10 ** decimals) * (Number(finalPrice) / 10 ** reserveDecimals)
  if (!Number.isFinite(ceilingReserve) || ceilingReserve <= 0) return { ceilingReserveWhole, ceilingReserve: null, ceilingUsd: null }
  let ceilingUsd: number | null = null
  if (
    currentUsdRate != null &&
    Number.isFinite(currentUsdRate) &&
    currentUsdRate > 0 &&
    currentPrice != null &&
    currentPrice > 0n
  ) {
    const currentPerToken = Number(currentPrice) / 10 ** reserveDecimals
    if (currentPerToken > 0) {
      const reserveUsdRate = currentUsdRate / currentPerToken
      const usd = ceilingReserve * reserveUsdRate
      ceilingUsd = Number.isFinite(usd) && usd > 0 ? usd : null
    }
  }
  return { ceilingReserveWhole, ceilingReserve, ceilingUsd }
}

/**
 * Fetch a token's curve ceiling. Fail-soft (nulls) — the seal UI treats an
 * unknown ceiling as "cannot verify", never as unlocked or blocked.
 */
export async function fetchTokenCeiling(query: MarketCapQuery): Promise<TokenCeiling> {
  const empty: TokenCeiling = {
    ceilingReserveWhole: null,
    ceilingReserve: null,
    ceilingUsd: null,
    reserveAddress: null,
    isNativeReserve: null,
  }
  if (!query.token || query.token.trim().length === 0) return empty
  try {
    const { mintclub } = await loadMintClub()
    const network = query.network ?? 'base'
    const networkKey = network as Parameters<typeof mintclub.network>[0]
    const token = mintclub.network(networkKey).token(query.token.trim())

    const [detail, usd] = await Promise.all([
      token.getDetail() as Promise<unknown>,
      token.getUsdRate() as Promise<{ usdRate?: number }>,
    ])

    const d = (detail ?? {}) as Record<string, unknown>
    const rawInfo = d.info ?? (Array.isArray(detail) ? (detail as unknown[])[0] : undefined)
    const info = (rawInfo ?? {}) as Record<string, unknown>
    const reserveRaw = info.reserveToken ?? info.reserve
    const reserveAddress =
      typeof reserveRaw === 'string' && reserveRaw.startsWith('0x') ? reserveRaw : null

    const wrapped = WRAPPED_NATIVE[network.toLowerCase()] ?? null
    const isNativeReserve =
      reserveAddress && wrapped ? reserveAddress.toLowerCase() === wrapped.toLowerCase() : null

    const usdRate = usd && Number.isFinite(usd.usdRate) ? (usd.usdRate as number) : null
    const { ceilingReserveWhole, ceilingReserve, ceilingUsd } = computeTokenCeiling(detail, usdRate)
    return { ceilingReserveWhole, ceilingReserve, ceilingUsd, reserveAddress, isNativeReserve }
  } catch {
    return empty
  }
}
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
