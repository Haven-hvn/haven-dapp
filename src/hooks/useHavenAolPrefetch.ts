'use client'

/**
 * Pre-warm the Haven-AOL v3 gate-key cache on wallet connect.
 *
 * Sprint 5 wires this hook to the new `prefetchGateKeyV3` path. The hook
 * runs once per `(walletConnected, walletAddress)` change and fires
 * best-effort prefetches for the user's known communities. The set of
 * "known active communities" is sourced from the existing
 * `useUserCommunities` discovery hook — we reuse the data the dapp already
 * fetches at sign-in, not a new endpoint.
 *
 * **Why prefetch matters in v3.** A v3 cache hit is the only way to get
 * sub-second video opens: every cache miss costs one EIP-712 wallet popup
 * plus one canister update call. The prefetch path uses
 * `currentEpoch()` from the SDK because at connect time we have no
 * specific file's `metadata.epoch` to read — this is the ONE place in the
 * dapp where `currentEpoch()` may be called (mirrors Key Design Decision
 * #3, which permits ops/diagnostic calls only — and prefetch is an
 * optimisation, never a security boundary).
 *
 * Hooks invariants:
 *   • Never blocks UI on prefetch completion.
 *   • Never surfaces errors as toasts.
 *   • Re-runs on `isConnected` / `address` change, NEVER on epoch tick.
 *
 * @module hooks/useHavenAolPrefetch
 */

import { useEffect, useRef } from 'react'
import { useAccount, useWalletClient } from 'wagmi'
import { currentEpoch } from 'haven-aol'
import { useUserCommunities } from './useCommunityFeed'
import {
  prefetchGateKeyV3,
  type PrefetchGateKeyV3Args,
} from '@/lib/haven-aol/haven-aol-decrypt-v3'
import type { TokenGate } from '@/types/attestation'
import type { Chain } from 'haven-aol'
import { normalizeChain } from '@/lib/haven-aol/haven-aol-metadata'

function tokenGateToCacheKey(gate: TokenGate, epoch: number): PrefetchGateKeyV3Args['cacheKey'] | null {
  try {
    const chain: Chain = normalizeChain(gate.chain)
    if (!gate.tokenAddress || gate.threshold === undefined || gate.threshold === null) {
      return null
    }
    return {
      chain,
      tokenAddress: gate.tokenAddress,
      threshold: BigInt(gate.threshold),
      epoch,
    }
  } catch {
    return null
  }
}

/**
 * Pre-warm the v3 gate-key cache for the connected wallet's known
 * communities. No-op when disconnected.
 *
 * @param walletConnected - Whether wagmi reports the wallet connected.
 */
export function useHavenAolPrefetch(walletConnected: boolean): void {
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const { communities } = useUserCommunities()
  const lastPrefetchedRef = useRef<string | null>(null)

  useEffect(() => {
    if (!walletConnected || !address || !walletClient || communities.length === 0) {
      return
    }
    // Idempotency key: prefetch once per (address, epoch). If the user's
    // communities list grows mid-session we'll catch the new ones on the
    // next disconnect/reconnect — re-running on every list mutation would
    // cause a popup-storm.
    const epoch = currentEpoch()
    const key = `${address.toLowerCase()}:${epoch}`
    if (lastPrefetchedRef.current === key) return
    lastPrefetchedRef.current = key

    const wallet = walletClient as unknown as Parameters<typeof prefetchGateKeyV3>[0]['walletClient']

    const tasks: Promise<unknown>[] = []
    for (const gate of communities) {
      const cacheKey = tokenGateToCacheKey(gate, epoch)
      if (!cacheKey) continue
      tasks.push(
        prefetchGateKeyV3({ cacheKey, walletClient: wallet }).catch(() => {
          // Best-effort. Failures here become normal cache misses later.
        }),
      )
    }

    if (tasks.length > 0) {
      // Fire and forget — never await.
      void Promise.allSettled(tasks)
    }
  }, [walletConnected, address, walletClient, communities])
}
