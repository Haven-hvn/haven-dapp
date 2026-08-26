'use client'

/**
 * HydrationNavBridge — completes the early-click guard contract.
 *
 * The inline guard script (root layout <head>) queues clicks on
 * extensionless internal links that land before React hydrates — on IPFS
 * gateways those would otherwise hit a directory listing. Once mounted,
 * this bridge marks hydration complete and replays any queued navigation
 * through the app router, keeping clean URLs (`/publish`, not `.html`).
 *
 * @module components/providers/HydrationNavBridge
 */

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function HydrationNavBridge() {
  const router = useRouter()

  useEffect(() => {
    window.__havenHydrated = true
    const pending = window.__havenPendingNav
    if (pending) {
      window.__havenPendingNav = null
      router.push(pending.path)
    }
  }, [router])

  return null
}
