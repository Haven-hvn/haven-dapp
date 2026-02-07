'use client'

import { useAccount, useDisconnect, useChainId, useSwitchChain } from 'wagmi'
import { Button } from '@/components/ui/button'
import { mainnet, sepolia } from 'wagmi/chains'
import { useState, useEffect } from 'react'

export function ConnectButton() {
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  const [mounted, setMounted] = useState(false)

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])

  // Check if on correct network (default to mainnet if not specified)
  const targetChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 1)
  const isCorrectNetwork = chainId === targetChainId

  // Get chain name for display
  const getChainName = (id: number) => {
    switch (id) {
      case mainnet.id:
        return 'Ethereum'
      case sepolia.id:
        return 'Sepolia'
      default:
        return 'Unknown'
    }
  }

  // Don't render until mounted to prevent hydration issues
  if (!mounted) {
    return (
      <Button size="lg" disabled className="min-h-[44px] touch-manipulation">
        Connect
      </Button>
    )
  }

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Address and chain - hidden on very small screens, shows on xs+ */}
        <div className="hidden xs:flex flex-col items-end">
          <span className="text-sm font-medium text-foreground">
            {address.slice(0, 6)}...{address.slice(-4)}
          </span>
          <span className="text-xs text-muted-foreground">
            {getChainName(chainId)}
            {!isCorrectNetwork && (
              <span className="text-destructive ml-1">(Wrong)</span>
            )}
          </span>
        </div>
        
        {/* Mobile-friendly address display */}
        <div className="flex xs:hidden items-center">
          <span className="text-sm font-medium text-foreground">
            {address.slice(0, 4)}...{address.slice(-2)}
          </span>
        </div>
        
        {!isCorrectNetwork && switchChain && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => switchChain({ chainId: targetChainId })}
            className="min-h-[36px] touch-manipulation text-xs sm:text-sm px-2 sm:px-3"
          >
            <span className="hidden sm:inline">Switch</span>
            <span className="sm:hidden">Switch</span>
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => disconnect()}
          className="min-h-[36px] touch-manipulation"
        >
          <span className="hidden sm:inline">Disconnect</span>
          <span className="sm:hidden">Exit</span>
        </Button>
      </div>
    )
  }

  // Use the native w3m-button when not connected
  // This avoids the need for the useWeb3Modal hook
  return <w3m-button />
}

// Alternative component using the native w3m-button with custom size
export function Web3ModalButton() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <Button size="lg" disabled className="min-h-[44px] touch-manipulation">
        Connect
      </Button>
    )
  }

  return <w3m-button />
}
