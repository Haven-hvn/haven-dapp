'use client'

import { ReactNode, useEffect, useState } from 'react'
import { WagmiProvider, type Config } from 'wagmi'
import { mainnet, sepolia, type AppKitNetwork } from '@reown/appkit/networks'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { createAppKit } from '@reown/appkit/react'

const metadata = {
  name: 'Haven Player',
  description: 'Decentralized video library and playback platform',
  url: 'https://haven.video',
  icons: ['https://haven.video/icon.png']
}

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || ''

// Initialize AppKit
let appKitInitialized = false

function initializeAppKit(): Config | null {
  if (typeof window === 'undefined' || !projectId || appKitInitialized) {
    return null
  }
  
  try {
    const appNetworks: [AppKitNetwork, ...AppKitNetwork[]] = [mainnet, sepolia]
    
    const wagmiAdapter = new WagmiAdapter({
      networks: appNetworks,
      projectId,
      ssr: true
    })
    
    createAppKit({
      adapters: [wagmiAdapter],
      networks: appNetworks,
      projectId,
      metadata,
      themeMode: 'dark',
      themeVariables: {
        '--apkt-accent': '#3b82f6',
      },
      features: {
        analytics: false,
      }
    })
    
    appKitInitialized = true
    return wagmiAdapter.wagmiConfig
  } catch (error) {
    console.error('Failed to initialize AppKit:', error)
    return null
  }
}

interface Web3ModalProviderProps {
  children: ReactNode
}

export function Web3ModalProvider({ children }: Web3ModalProviderProps) {
  const [wagmiConfig, setWagmiConfig] = useState<Config | null>(null)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    const config = initializeAppKit()
    setWagmiConfig(config)
    setIsReady(true)
  }, [])

  if (!projectId) {
    return <>{children}</>
  }

  if (!isReady) {
    return <>{children}</>
  }

  if (!wagmiConfig) {
    return <>{children}</>
  }

  return (
    <WagmiProvider config={wagmiConfig}>
      {children}
    </WagmiProvider>
  )
}
