export const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "b56e18d47c72ab683b10814fe9495694"

// Lazy initialization to avoid SSR issues with localStorage
let _networks: any = null
let _wagmiAdapter: any = null

export const getNetworks = () => {
  if (!_networks) {
    const { mainnet, sepolia } = require('@reown/appkit/networks')
    _networks = [mainnet, sepolia]
  }
  return _networks
}

export const networks = {
  get value() {
    return getNetworks()
  }
}

export const getWagmiAdapter = () => {
  if (typeof window === 'undefined') {
    return null
  }
  if (!_wagmiAdapter) {
    const { WagmiAdapter } = require('@reown/appkit-adapter-wagmi')
    _wagmiAdapter = new WagmiAdapter({
      ssr: true,
      projectId,
      networks: getNetworks()
    })
  }
  return _wagmiAdapter
}

export const wagmiAdapter = {
  get wagmiConfig() {
    const adapter = getWagmiAdapter()
    return adapter?.wagmiConfig ?? null
  }
}

export const config = {
  get() {
    return wagmiAdapter.wagmiConfig
  }
}
