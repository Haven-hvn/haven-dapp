'use client'

import { modal } from '@/context'
import { useState, useEffect } from 'react'
import { useAccount, useDisconnect } from 'wagmi'

/**
 * ConnectButton — the wallet control.
 *
 * A keyline chip when disconnected; a sealed action once connected. The
 * address is set in the ledger register — it is evidence, not decoration.
 */
export function ConnectButton() {
  const [mounted, setMounted] = useState(false)
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])

  const baseClass =
    'action action-keyline min-h-[44px] px-5 touch-manipulation'

  // Show loading state while mounting or if modal isn't available
  if (!mounted) {
    return (
      <button className={baseClass} disabled>
        Connect
      </button>
    )
  }

  // If no project ID is configured, show disabled button
  if (!modal) {
    return (
      <button
        className={baseClass}
        disabled
        title="WalletConnect not configured"
      >
        Connect
      </button>
    )
  }

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="hidden xs:flex flex-col items-end gap-1">
          <span className="addr text-fg-2">
            {address.slice(0, 6)}…{address.slice(-4)}
          </span>
          <span className="label text-[0.5625rem] text-seal-text">
            Connected
          </span>
        </div>

        <div className="flex xs:hidden items-center">
          <span className="addr text-fg-2">
            {address.slice(0, 4)}…{address.slice(-2)}
          </span>
        </div>

        <button
          onClick={() => modal?.open()}
          className="action action-keyline min-h-[36px] px-4 touch-manipulation"
        >
          Wallet
        </button>

        <button
          onClick={() => disconnect()}
          className="label hidden sm:inline-block link-rule"
        >
          Leave
        </button>
      </div>
    )
  }

  return (
    <button
      className={`${baseClass} border-seal-edge text-seal hover:border-seal`}
      onClick={() => modal?.open()}
    >
      Connect
    </button>
  )
}
