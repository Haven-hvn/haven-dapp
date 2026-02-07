'use client'

import { createWeb3Modal } from '@web3modal/wagmi/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { mainnet, sepolia } from 'wagmi/chains'
import { walletConnect, injected } from '@wagmi/connectors'
import { ReactNode, useState, useEffect } from 'react'

// Metadata for WalletConnect
const metadata = {
  name: 'Haven Player',
  description: 'Decentralized video library and playback platform',
  url: 'https://haven.video',
  icons: ['https://haven.video/icon.png']
}

// Create wagmi config
function createWagmiConfig(projectId: string) {
  const connectors = projectId ? [
    walletConnect({
      projectId,
      metadata,
      showQrModal: false, // We'll use Web3Modal UI instead
    }),
    injected({ target: 'metaMask' }),
  ] : []

  return createConfig({
    chains: [mainnet, sepolia],
    connectors,
    transports: {
      [mainnet.id]: http(),
      [sepolia.id]: http(),
    },
  })
}

// Initialize Web3Modal on client side only
function initWeb3Modal(projectId: string, config: ReturnType<typeof createWagmiConfig>) {
  if (typeof window === 'undefined') return null
  
  if (!projectId) {
    console.warn('NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not defined. WalletConnect will not work.')
    return null
  }
  
  try {
    createWeb3Modal({
      wagmiConfig: config,
      projectId,
      themeMode: 'dark',
      themeVariables: {
        '--w3m-accent': '#3b82f6',
      }
    })
    return true
  } catch (e) {
    console.error('Failed to create Web3Modal:', e)
    return null
  }
}

interface Web3ModalProviderProps {
  children: ReactNode
}

export function Web3ModalProvider({ children }: Web3ModalProviderProps) {
  // Get project ID from env
  const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || ''
  
  // Create query client
  const [queryClient] = useState(() => new QueryClient())
  
  // Create config
  const [config] = useState(() => createWagmiConfig(projectId))
  
  // Initialize Web3Modal on client side
  const [isInitialized, setIsInitialized] = useState(false)
  
  useEffect(() => {
    if (!isInitialized) {
      initWeb3Modal(projectId, config)
      setIsInitialized(true)
    }
  }, [projectId, config, isInitialized])
  
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  )
}
