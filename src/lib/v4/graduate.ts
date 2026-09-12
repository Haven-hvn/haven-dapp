/**
 * Graduate-path token creation: mint.club bond + GlueHook Uniswap V4 pool +
 * RoyaltyRouter, in one `factory.launch()` transaction.
 *
 * This is the default on chains where Glue + Uniswap V4 + mint.club are all
 * deployed AND a factory address is configured (see env). Chains without a
 * configured factory fall back to mint.club-only (`mint-create.ts`).
 *
 * The SDK is loaded dynamically so the publish wizard keeps its lazy,
 * browser-only footprint for web3 paths.
 *
 * @module lib/v4/graduate
 */

export interface GraduateDeployment {
  chainId: number
  bond: `0x${string}`
  bondTokenImplementation: `0x${string}`
  hook: `0x${string}`
  poolManager: `0x${string}`
  wnative: `0x${string}`
  factory: `0x${string}`
}

const BOND = '0xc5a076cad94176c2996B32d8466Be1cE757FAa27' as const
const BOND_TOKEN = '0xAa70bC79fD1cB4a6FBA717018351F0C3c64B79Df' as const
const HOOK = '0x0F41715dc432692b66A5aDF8dCfef6Ac407b20c8' as const
const POOL_MANAGER = '0x498581fF718922c3f8e6A244956aF099B2652b2b' as const

const WETH_MAINNET = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as const
const WETH_OP_BASE = '0x4200000000000000000000000000000000000006' as const
const WETH_ARB = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' as const

const CHAIN_IDS: Record<string, number> = {
  EthMainnet: 1,
  OptimismMainnet: 10,
  ArbitrumOne: 42161,
  BaseMainnet: 8453,
}

const WNATIVE: Record<number, `0x${string}`> = {
  1: WETH_MAINNET,
  10: WETH_OP_BASE,
  42161: WETH_ARB,
  8453: WETH_OP_BASE,
}

/** Factory env per chain id, e.g. `NEXT_PUBLIC_GRADUATE_FACTORY_10`. */
function factoryEnv(chainId: number): `0x${string}` | null {
  const raw =
    typeof process !== 'undefined'
      ? process.env?.[`NEXT_PUBLIC_GRADUATE_FACTORY_${chainId}`]
      : null
  return raw != null && /^0x[0-9a-fA-F]{40}$/.test(raw.trim())
    ? (raw.trim() as `0x${string}`)
    : null
}

/**
 * Graduate deployment for a Haven chain, or null when the graduate path is
 * unavailable (unsupported chain or no factory configured) — the caller
 * must fall back to mint.club-only.
 */
export function getGraduateDeployment(chain: string): GraduateDeployment | null {
  const chainId = CHAIN_IDS[chain]
  const wnative = chainId != null ? WNATIVE[chainId] : undefined
  if (chainId == null || wnative == null) return null
  const factory = factoryEnv(chainId)
  if (!factory) return null
  return {
    chainId,
    bond: BOND,
    bondTokenImplementation: BOND_TOKEN,
    hook: HOOK,
    poolManager: POOL_MANAGER,
    wnative,
    factory,
  }
}

export interface GraduateCreateArgs {
  // viem clients; typed loosely to avoid a hard viem import at module scope.
  publicClient: unknown
  walletClient: unknown
  chain: string
  name: string
  symbol: string
  /** LP-fee remainder + pot recipient. Defaults to the connected account. */
  feeRecipient?: `0x${string}`
}

/**
 * Launch a graduated token (bond + pool + router, one tx). Throws when the
 * chain has no graduate deployment or the SDK launch fails.
 */
export async function createGraduatedToken(
  args: GraduateCreateArgs
): Promise<{ address: string | null; router: string | null; txHash?: string; error?: string }> {
  const { publicClient, walletClient, chain, name, symbol } = args
  if (!name.trim() || !symbol.trim())
    return { address: null, router: null, error: 'Name and symbol required' }
  const d = getGraduateDeployment(chain)
  if (!d) return { address: null, router: null, error: 'Graduate path not configured on this chain' }
  try {
    const sdk = await import('@royalty-router/sdk')
    const wallet = walletClient as { account?: { address: `0x${string}` } }
    const feeRecipient =
      args.feeRecipient ?? wallet.account?.address ?? ('0x0000000000000000000000000000000000000000' as const)
    // Recommended tokenomics: 15% royalty both ways, 0.3% pool fee, 100%
    // compounding, smooth 20-step geometric curve over the wizard's
    // 1B-supply / 0.0000001→0.00001 ETH range, swap-free WETH-reserve route.
    const intent = sdk.recommendedIntent({
      name: name.trim(),
      symbol: symbol.trim(),
      reserveToken: d.wnative,
      feeRecipient,
      curve: {
        freeRange: 1_000n * 10n ** 18n,
        maxSupply: 1_000_000_000n * 10n ** 18n,
        startPrice: 100_000_000_000n, // 0.0000001 ETH
        endPrice: 10_000_000_000_000n, // 0.00001 ETH
      },
    })
    const built = await sdk.buildLaunch(
      publicClient as Parameters<typeof sdk.buildLaunch>[0],
      d,
      intent
    )
    const r = await sdk.launch(
      publicClient as Parameters<typeof sdk.launch>[0],
      walletClient as Parameters<typeof sdk.launch>[1],
      d,
      built
    )
    return { address: r.token, router: r.router, txHash: r.hash }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { address: null, router: null, error: message }
  }
}
