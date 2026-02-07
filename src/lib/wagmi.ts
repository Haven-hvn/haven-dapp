import { createConfig, http } from 'wagmi'
import { mainnet, sepolia } from 'wagmi/chains'

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID

if (!projectId) {
  console.warn('NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not defined. WalletConnect will not work.')
}

export const config = createConfig({
  chains: [mainnet, sepolia],
  transports: {
    [mainnet.id]: http(process.env.NEXT_PUBLIC_ALCHEMY_RPC),
    [sepolia.id]: http(process.env.NEXT_PUBLIC_ALCHEMY_RPC),
  },
})
