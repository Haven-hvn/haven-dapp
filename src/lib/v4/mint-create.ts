import type { WalletClient } from 'viem'

export async function createMintClubToken(args: {
  walletClient: WalletClient
  network: string
  name: string
  symbol: string
  chainId?: number
}): Promise<{ address: string | null; txHash?: string; error?: string }> {
  const { walletClient, network, name, symbol } = args
  if (!name.trim() || !symbol.trim()) return { address: null, error: 'Name and symbol required' }
  try {
    const { mintclub } = await import('@mint.club/v2-sdk')
    // Use ETH as reserve for simplicity (zero address handled via sdk)
    const sdk = mintclub.network(network as any).withWalletClient(walletClient as any)
    const token = sdk.token(symbol.trim())
    // Simple linear curve: 0.0001 ETH -> 0.01 ETH, 1B supply
    const txHash = await token.create({
      name: name.trim(),
      curveData: {
        curveType: 'LINEAR' as any,
        stepCount: 10,
        maxSupply: 1_000_000_000,
        initialMintingPrice: 0.0000001,
        finalMintingPrice: 0.00001,
        creatorAllocation: 0,
      },
      // reserve defaults to native wrapped (handled by sdk); omit to use config default
      reserveToken: { address: '0x0000000000000000000000000000000000000000' as any, decimals: 18 } as any,
    } as any)
    // Resolve address post-create
    let address: string | null = null
    try { address = await sdk.token(symbol.trim()).getTokenAddress() as string } catch {}
    return { address, txHash: txHash as string }
  } catch (e: any) {
    return { address: null, error: e?.message ?? String(e) }
  }
}
