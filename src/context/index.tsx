'use client'

import { wagmiAdapter, projectId, networks } from '@/config'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createAppKit } from '@reown/appkit/react'
import React, { type ReactNode } from 'react'
import { cookieToInitialState, WagmiProvider, type Config } from 'wagmi'

function getClientCookies(): string | null {
  if (typeof document !== 'undefined') {
    return document.cookie || null
  }
  return null
}

// Set up queryClient
const queryClient = new QueryClient()

// Set up metadata
const metadata = {
  name: 'Haven - Decentralized Video Library',
  description: 'Access your encrypted video collection from anywhere using your Web3 wallet. Secure, private, and decentralized video storage powered by IPFS, Filecoin, and Lit Protocol.',
  url: process.env.NEXT_PUBLIC_APP_URL || 'https://haven.video',
  icons: [process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL}/icon.png` : 'https://haven.video/icon.png']
}

// Create the modal (module-level initialization)
export const modal = projectId 
  ? createAppKit({
      adapters: [wagmiAdapter],
      projectId,
      networks,
      metadata,
      themeMode: 'dark',
      features: {
        analytics: false,
      },
      themeVariables: {
        '--w3m-accent': '#3b82f6',
      }
    })
  : null

interface ContextProviderProps {
  children: ReactNode
}

function ContextProvider({ children }: ContextProviderProps) {
  const cookies = getClientCookies()
  const initialState = cookieToInitialState(wagmiAdapter.wagmiConfig as Config, cookies)

  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig as Config} initialState={initialState}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  )
}

export default ContextProvider
