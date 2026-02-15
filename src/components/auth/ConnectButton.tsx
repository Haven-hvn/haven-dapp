'use client'

import { modal } from '@/context/ClientContextProvider'
import { Button } from '@/components/ui/button'
import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'

export function ConnectButton() {
  const [mounted, setMounted] = useState(false)
  const { address, isConnected } = useAccount()

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <Button size="lg" disabled>Connect</Button>
  }

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">
          {address.slice(0, 6)}...{address.slice(-4)}
        </span>
        <Button variant="outline" size="sm" onClick={() => modal.open()}>
          Wallet
        </Button>
      </div>
    )
  }

  return (
    <Button size="lg" onClick={() => modal.open()}>
      Connect
    </Button>
  )
}
