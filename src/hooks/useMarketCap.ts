'use client'

/**
 * useMarketCap — live market cap polling for V4 drip gates.
 *
 * Wraps `fetchTokenMarketCap` (mint.club bonding-curve math) in a
 * react-query hook with a 30s refresh so lock screens track the pump toward
 * their unlock target. Degrades to `marketCapUsd: null` while price paths
 * are unavailable — callers must render "unknown" rather than unlocked.
 *
 * @module hooks/useMarketCap
 */

import { useQuery } from '@tanstack/react-query'
import {
  fetchEthUsd,
  fetchTokenCeiling,
  fetchTokenMarketCap,
  type MarketCapResult,
  type TokenCeiling,
} from '@/lib/v4/market-cap'

const STALE_MS = 15_000
const REFRESH_MS = 30_000

export interface UseMarketCapResult extends Partial<MarketCapResult> {
  isLoading: boolean
  isError: boolean
  refetch: () => void
}

/**
 * Poll the live USD market cap of a gate token.
 *
 * Pass `token: null | ''` to skip querying entirely (no gate configured).
 */
export function useMarketCap(token: string | null | undefined, network?: string): UseMarketCapResult {
  const enabled = Boolean(token && token.trim().length > 0)

  const query = useQuery({
    queryKey: ['v4-market-cap', network ?? 'base', (token ?? '').trim()],
    queryFn: () => fetchTokenMarketCap({ token: token as string, network }),
    enabled,
    staleTime: STALE_MS,
    refetchInterval: REFRESH_MS,
    retry: 1,
  })

  return {
    marketCapUsd: query.data?.marketCapUsd ?? null,
    priceUsd: query.data?.priceUsd ?? null,
    supply: query.data?.supply ?? null,
    symbol: query.data?.symbol ?? null,
    address: query.data?.address ?? null,
    isLoading: enabled && query.isLoading,
    isError: query.isError,
    refetch: () => {
      void query.refetch()
    },
  }
}

/**
 * Poll the live WETH/USD rate for seal-time USD→ETH conversion and dual
 * display. Null while unavailable — seal must block (fail closed), never
 * guess. Refreshes slower than token caps: the rate only matters at seal
 * minute, not per block.
 */
export function useEthUsd(): { ethUsd: number | null; isLoading: boolean } {
  const query = useQuery({
    queryKey: ['v4-eth-usd'],
    queryFn: () => fetchEthUsd(),
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 1,
  })
  return { ethUsd: query.data ?? null, isLoading: query.isLoading }
}

/**
 * Poll a gate token's curve ceiling (`maxSupply × finalPrice`).
 *
 * Fail-soft: `ceiling` is null while loading or when the curve cannot be
 * read. Callers must treat null as "cannot verify" — never as a license to
 * seal unreachable rungs, and never as a reason to block sealing outright
 * (the rate path failing must not brick the wizard).
 */
export function useTokenCeiling(
  token: string | null | undefined,
  network?: string
): { ceiling: TokenCeiling | null; isLoading: boolean } {
  const enabled = Boolean(token && token.trim().length > 0)

  const query = useQuery({
    queryKey: ['v4-token-ceiling', network ?? 'base', (token ?? '').trim()],
    queryFn: () => fetchTokenCeiling({ token: token as string, network }),
    enabled,
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 1,
  })

  return { ceiling: query.data ?? null, isLoading: enabled && query.isLoading }
}

/**
 * Pure unlock evaluation shared by publisher preview and reader lock UI.
 *
 * `current === null` means unknown — treated as LOCKED (fail closed).
 */
export function evaluateDripUnlock(
  targetUsd: number,
  currentUsd: number | null | undefined
): { unlocked: boolean; progress: number | null } {
  if (!Number.isFinite(targetUsd) || targetUsd <= 0) {
    return { unlocked: false, progress: null }
  }
  if (currentUsd == null || !Number.isFinite(currentUsd)) {
    return { unlocked: false, progress: null }
  }
  return {
    unlocked: currentUsd >= targetUsd,
    progress: Math.max(0, Math.min(1, currentUsd / targetUsd)),
  }
}
