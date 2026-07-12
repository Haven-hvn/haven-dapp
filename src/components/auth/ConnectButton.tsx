'use client'

import { modal } from '@/context'
import { Button } from '@/components/ui/button'
import { useState, useEffect } from 'react'
import { useAccount, useDisconnect } from 'wagmi'

export function ConnectButton() {
  const [mounted, setMounted] = useState(false)
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])

  // Show loading state while mounting or if modal isn't available
  if (!mounted) {
    return (
      <Button size="lg" disabled className="min-h-[44px] touch-manipulation">
        Connect
      </Button>
    )
  }

  // If no project ID is configured, show disabled button
  if (!modal) {
    return (
      <Button size="lg" disabled className="min-h-[44px] touch-manipulation" title="WalletConnect not configured">
        Connect
      </Button>
    )
  }

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="hidden xs:flex flex-col items-end">
          <span className="text-sm font-medium text-foreground">
            {address.slice(0, 6)}...{address.slice(-4)}
          </span>
          <span className="text-xs text-muted-foreground">
            Connected
          </span>
        </div>
        
        <div className="flex xs:hidden items-center">
          <span className="text-sm font-medium text-foreground">
            {address.slice(0, 4)}...{address.slice(-2)}
          </span>
        </div>
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => modal?.open()}
          className="min-h-[36px] touch-manipulation"
        >
          <span>Wallet</span>
        </Button>
      </div>
    )
  }

  return (
    <Button
      size="lg"
      onClick={() => modal?.open()}
      className="min-h-[44px] touch-manipulation"
    >
      Connect
    </Button>
  )
}
