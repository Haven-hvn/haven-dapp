import type { WalletClient } from 'viem'

/**
 * Minimal typed surface of @mint.club/v2-sdk covering only what this module
 * uses. The SDK's own types lose `.token` after `.withWalletClient()` because
 * its polymorphic-`this` return collapses to the base Client class, which is
 * why the network handle is narrowed locally instead.
 */
interface MintClubNetworkToken {
  create: (
    params: unknown
  ) => Promise<{ transactionHash?: string } | undefined>
  getTokenAddress: () => Promise<`0x${string}`>
}

interface MintClubNetwork {
  withWalletClient: (walletClient: WalletClient) => unknown
  token: (symbolOrAddress: string) => MintClubNetworkToken
}

export async function createMintClubToken(args: {
  walletClient: WalletClient
  network: string
  name: string
  symbol: string
  chainId?: number
}): Promise<{ address: string | null; txHash?: string; error?: string }> {
  const { walletClient, network, name, symbol } = args
  if (!name.trim() || !symbol.trim())
    return { address: null, error: 'Name and symbol required' }
  try {
    const { mintclub } = await import('@mint.club/v2-sdk')
    const net = (
      mintclub.network as unknown as (id: string) => MintClubNetwork
    )(network)
    // Attaches the signer inside the SDK; the returned value is ignored
    // because the SDK mutates the network instance in place.
    net.withWalletClient(walletClient)

    // Simple linear curve: 0.0001 ETH -> 0.01 ETH, 1B supply
    const token = net.token(symbol.trim())
    const receipt = await token.create({
      name: name.trim(),
      curveData: {
        curveType: 'LINEAR',
        stepCount: 10,
        maxSupply: 1_000_000_000,
        initialMintingPrice: 0.0000001,
        finalMintingPrice: 0.00001,
        creatorAllocation: 0,
      },
      // Reserve defaults to native wrapped (handled by the SDK); omit to use
      // the config default. Zero address is passed explicitly for clarity.
      reserveToken: {
        address: '0x0000000000000000000000000000000000000000',
        decimals: 18,
      },
    })

    // Resolve address post-create
    let address: string | null = null
    try {
      address = await net.token(symbol.trim()).getTokenAddress()
    } catch {
      address = null
    }
    return { address, txHash: receipt?.transactionHash }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { address: null, error: message }
  }
}
