'use client'

import { Suspense } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { useAccount } from 'wagmi'
import { useHydration } from '@/hooks/useHydration'
import { ConnectButton } from '@/components/auth/ConnectButton'
import Link from 'next/link'

interface ProtectedRouteProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

function ConnectScreen() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const qs = searchParams?.toString()
  const requestedPath = qs ? `${pathname}?${qs}` : pathname || '/'
  return <ConnectPrompt requestedPath={requestedPath} />
}

export function ProtectedRoute({ children, fallback }: ProtectedRouteProps) {
  const { isConnected, isConnecting } = useAccount()
  const isHydrated = useHydration()

  if (!isHydrated || isConnecting) {
    return fallback || <LoadingScreen />
  }

  if (!isConnected) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <ConnectScreen />
      </Suspense>
    )
  }

  return <>{children}</>
}

function LoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center bg-surface">
      <div className="flex items-center gap-4">
        <span className="pip net-haven w-2.5 h-2.5" aria-hidden="true" />
        <p className="label">Verifying the register</p>
      </div>
    </div>
  )
}

/**
 * Inline connect-wallet prompt. Replaces the silent redirect-to-landing
 * pattern so direct links to gated routes give the user clear context:
 * what they were trying to reach and what to do next.
 */
function ConnectPrompt({ requestedPath }: { requestedPath: string }) {
  return (
    <div className="min-h-screen bg-surface text-fg flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center crop-marks p-10 border border-line">
        <span className="folio block mb-6">—</span>

        <h1 className="statement-title mb-3">
          Connect your wallet <em className="voice-editorial overprint">to continue</em>
        </h1>
        <p className="text-small text-fg-3 leading-relaxed mb-8">
          You followed a link to{' '}
          <span className="addr !text-[0.75rem] text-fg-2 break-all">
            {requestedPath}
          </span>
          . This page is wallet-gated — connect to verify your identity and
          access any token-gated content you hold.
        </p>

        <div className="flex flex-col items-center gap-4">
          <ConnectButton />
          <Link
            href="/"
            className="label link-rule"
          >
            Back to home
          </Link>
        </div>

        <p className="mt-10 pt-6 border-t border-line-soft label !whitespace-normal normal-case tracking-[0.02em] leading-relaxed">
          Note: some communities are token-gated. After connecting you may
          still need to hold a specific NFT or ERC-20 to play videos.
        </p>
      </div>
    </div>
  )
}
