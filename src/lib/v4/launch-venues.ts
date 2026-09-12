/**
 * Launch venues per gate chain — mint.club everywhere, Glue/Uniswap
 * graduation only where both are deployed.
 *
 * Chains with mint.club but no Glue + Uniswap V4 stay usable: token
 * creation falls back to mint.club-only with a 0 creator fee (no
 * royalty to route, no pool to seed).
 *
 * @module lib/v4/launch-venues
 */

import type { Chain } from 'haven-aol'
import { getGraduateDeployment } from './graduate'

/** Default gate chain for new publishes. */
export const DEFAULT_GATE_CHAIN: Chain = 'OptimismMainnet'

/**
 * Chains where GlueHook + Uniswap V4 + mint.club are all deployed, so
 * `factory.launch()` (bonding-curve token + locked-liquidity pool +
 * royalty router) is available.
 */
const GRADUATION_CHAINS: ReadonlySet<string> = new Set([
  'OptimismMainnet',
  'BaseMainnet',
  'ArbitrumOne',
  'EthMainnet',
])

/** Whether Glue + Uniswap V4 + mint.club are all deployed on this chain. */
export function isGraduationSupported(chain: string): boolean {
  return GRADUATION_CHAINS.has(chain)
}

/**
 * Whether a graduate launch can actually run right now: supported chain
 * AND a factory address configured (see `getGraduateDeployment`). The
 * wizard uses this — not `isGraduationSupported` — to pick the path.
 */
export function isGraduationAvailable(chain: string): boolean {
  if (!isGraduationSupported(chain)) return false
  return getGraduateDeployment(chain) != null
}

/** Launch mode for a chain: graduate where supported, mint.club-only elsewhere. */
export function launchModeFor(chain: string): 'graduate' | 'mint-only' {
  return isGraduationSupported(chain) ? 'graduate' : 'mint-only'
}

/**
 * Creator fee in bps for a fresh mint on this chain. Graduation chains
 * take the SDK recommended royalty; mint-only chains must be 0 — there
 * is no router to compound it into liquidity.
 */
export function creatorFeeBpsFor(chain: string): number {
  return isGraduationSupported(chain) ? 1500 : 0
}
