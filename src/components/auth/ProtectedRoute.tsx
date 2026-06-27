'use client'

import { Suspense } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { useAccount } from 'wagmi'
import { useHydration } from '@/hooks/useHydration'
import { ConnectButton } from '@/components/auth/ConnectButton'
import { Lock, ArrowLeft } from 'lucide-react'
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
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
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
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-6">
          <Lock className="w-7 h-7 text-primary" />
        </div>

        <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-2">
          Connect your wallet to continue
        </h1>
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
          You followed a link to{' '}
          <span className="font-mono text-foreground/80 break-all">
            {requestedPath}
          </span>
          . This page is wallet-gated — connect to verify your identity and
          access any token-gated content you hold.
        </p>

        <div className="flex flex-col items-center gap-3">
          <ConnectButton />
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to home
          </Link>
        </div>

        <p className="mt-8 text-xs text-muted-foreground/70 leading-relaxed">
          Note: some communities are token-gated. After connecting you may
          still need to hold a specific NFT or ERC-20 to play videos.
        </p>
      </div>
    </div>
  )
}
