'use client'

import { useAppKitAccount, useAppKit } from '@reown/appkit/react'
import { Button } from '@/components/ui/button'
import { useState, useEffect } from 'react'

export function ConnectButton() {
  const [mounted, setMounted] = useState(false)
  const [appKitReady, setAppKitReady] = useState(false)

  // Prevent hydration mismatch and wait for AppKit
  useEffect(() => {
    setMounted(true)
    // Give AppKit time to initialize
    const timer = setTimeout(() => {
      setAppKitReady(true)
    }, 100)
    return () => clearTimeout(timer)
  }, [])

  // Don't render until mounted to prevent hydration issues
  if (!mounted || !appKitReady) {
    return (
      <Button size="lg" disabled className="min-h-[44px] touch-manipulation">
        Connect
      </Button>
    )
  }

  return <ConnectButtonInner />
}

function ConnectButtonInner() {
  const { address, isConnected } = useAppKitAccount()
  const { open } = useAppKit()

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Address and chain - hidden on very small screens, shows on xs+ */}
        <div className="hidden xs:flex flex-col items-end">
          <span className="text-sm font-medium text-foreground">
            {address.slice(0, 6)}...{address.slice(-4)}
          </span>
          <span className="text-xs text-muted-foreground">
            Connected
          </span>
        </div>
        
        {/* Mobile-friendly address display */}
        <div className="flex xs:hidden items-center">
          <span className="text-sm font-medium text-foreground">
            {address.slice(0, 4)}...{address.slice(-2)}
          </span>
        </div>
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => open()}
          className="min-h-[36px] touch-manipulation"
        >
          <span className="hidden sm:inline">Wallet</span>
          <span className="sm:hidden">Wallet</span>
        </Button>
      </div>
    )
  }

  // Use the native appkit-button when not connected
  // This avoids the need for the useAppKit hook
  return <appkit-button />
}

// Alternative component using the native appkit-button with custom size
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

  return <appkit-button />
}
