'use client'

import { Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useUserCommunities, useCommunityFeedForGate } from '@/hooks/useCommunityFeed'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { LibraryLayout } from '@/components/layout/LibraryLayout'
import { CommunityCard } from '@/components/community/CommunityCard'
import { CommunityAccessNotice } from '@/components/community/CommunityAccessNotice'
import * as React from 'react'
import { useAccount } from '@/hooks/useAccount'
import { HolderIdentity } from '@/components/profile/HolderIdentity'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { TokenGate } from '@/types/attestation'

function Spinner({ note }: { note: string }) {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center">
        <span className="pip net-haven w-3 h-3 mx-auto mb-4" aria-hidden="true" />
        <p className="label">{note}</p>
      </div>
    </div>
  )
}

function ErrorState({
  message,
  onRetry,
}: {
  message?: string
  onRetry: () => void
}) {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center max-w-md">
        <p className="seal-mark border-destructive text-destructive mb-4 inline-flex">
          Record Unavailable
        </p>
        <p className="text-small text-fg-3 mb-5">{message}</p>
        <button onClick={onRetry} className="action action-keyline py-3">
          Retry
        </button>
      </div>
    </div>
  )
}

function CommunityListContent() {
  const router = useRouter()
  const { communities, isLoading, error, refetch } = useUserCommunities()
  const [gatingChain, setGatingChain] = React.useState<string>('all')
  const { chainId, isConnected } = useAccount()
  React.useEffect(() => {
    if (!isConnected || !chainId) return
    const m: Record<number, string> = { 1: 'EthMainnet', 11155111: 'EthSepolia', 8453: 'BaseMainnet', 42161: 'ArbitrumOne', 10: 'OptimismMainnet' }
    const next = m[chainId] ?? 'all'
    setGatingChain((prev) => (prev === 'all' ? next : prev))
  }, [chainId, isConnected])

  if (isLoading) return <Spinner note="Discovering your communities" />

  if (error) {
    return <ErrorState message={error.message} onRetry={() => refetch()} />
  }

  if (!communities.length) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center max-w-md crop-marks p-8">
          <p className="folio mb-4">—</p>
          <h3 className="statement-subtitle mb-3">No communities yet</h3>
          <p className="text-small text-fg-3 leading-relaxed">
            Upload token-gated content to discover your communities.
            Communities are formed around shared token gates.
          </p>
        </div>
      </div>
    )
  }

  const handleCommunityClick = (gate: TokenGate) => {
    router.push(`/community?c=${encodeURIComponent(gate.tokenAddress)}`)
  }

  const filtered = gatingChain === 'all' ? communities : communities.filter(g => g.chain.toLowerCase() === gatingChain.toLowerCase())

  return (
    <div>
      <div className="flex items-center gap-4 mb-5 pb-3 border-b border-line-soft flex-wrap">
        <label className="label" htmlFor="gating-chain">Gating chain</label>
        <select
          id="gating-chain"
          value={gatingChain}
          onChange={e => setGatingChain(e.target.value)}
          className="px-2.5 py-1.5 bg-transparent border border-line-strong text-nano font-[family-name:var(--font-ledger)] tracking-[0.08em] uppercase text-fg-2 cursor-pointer"
          title="haven-aol VALID_CHAINS — DFINITY EVM RPC"
        >
          <option value="all">All chains</option>
          <option value="EthMainnet">EthMainnet</option>
          <option value="BaseMainnet">BaseMainnet</option>
          <option value="ArbitrumOne">ArbitrumOne</option>
          <option value="OptimismMainnet">OptimismMainnet</option>
          <option value="EthSepolia">EthSepolia</option>
        </select>
        <span className="datum text-fg-5 ml-auto">{filtered.length} DAOs · RPC via DFINITY</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((gate) => (
          <CommunityCard
            key={`${gate.chain}:${gate.tokenAddress}`}
            gate={gate}
            onClick={handleCommunityClick}
          />
        ))}
      </div>
      {!filtered.length && communities.length > 0 && (
        <p className="label mt-5">No communities on {gatingChain}.</p>
      )}
    </div>
  )
}

function CommunityFeedContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const gateToken = searchParams.get('c')
  const { communities } = useUserCommunities()
  const { videos, isLoading, error, refetch } = useCommunityFeedForGate(gateToken)

  const gate = gateToken
    ? communities.find(
        (g) => g.tokenAddress.toLowerCase() === gateToken.toLowerCase()
      ) ?? null
    : null

  // A user is a "member" of this community (in the loose Haven sense) when
  // they have uploaded a video gated by this token themselves — that's the
  // only way `useUserCommunities` surfaces a gate. Anyone else (a visitor
  // following a shared link, or a holder who hasn't uploaded yet) gets the
  // access notice so they understand what they're looking at and why
  // playback may fail.
  const isMember = gate !== null

  // When the visitor isn't a known member we don't have a `TokenGate` from
  // `useUserCommunities` (since that hook only looks at the viewer's own
  // entities). Synthesize one from the first feed video — the community-feed
  // query carries the entity's own `gate_chain` / `gate_threshold` attrs, so
  // we get a complete picture to show in the access notice.
  const displayGate: TokenGate | null =
    gate ??
    (gateToken && videos.length > 0
      ? {
          tokenAddress: gateToken,
          chain: videos[0].gateChain,
          threshold: videos[0].gateThreshold,
        }
      : null)

  if (!gateToken) {
    return <CommunityListContent />
  }

  if (isLoading) return <Spinner note="Loading community videos" />

  if (error) {
    return <ErrorState message={error.message} onRetry={() => refetch()} />
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <button
          onClick={() => router.push('/community')}
          className="inline-flex items-center gap-1.5 label link-rule"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </button>

        <span className="seal-mark">
          <span className={`net-dot net-evm`} aria-hidden="true" />
          <span className="addr !text-[0.6875rem]" style={{ color: 'inherit' }}>
            {displayGate
              ? `${displayGate.tokenAddress.slice(0, 6)}…${displayGate.tokenAddress.slice(-4)}`
              : `${gateToken.slice(0, 6)}…${gateToken.slice(-4)}`}
          </span>
          {displayGate?.chain && (
            <span className="opacity-60">{displayGate.chain}</span>
          )}
        </span>
      </div>

      <CommunityAccessNotice
        gate={displayGate}
        gateTokenAddress={gateToken}
        isMember={isMember}
        hasFeedContent={videos.length > 0}
      />

      {videos.length === 0 ? (
        <div className="text-center py-12 crop-marks max-w-lg mx-auto p-8">
          <p className="folio mb-4">—</p>
          <p className="statement-subtitle mb-2">No community content yet for this gate.</p>
          <p className="text-small text-fg-3 leading-relaxed">
            {isMember
              ? 'Content will appear here when community members upload gated videos.'
              : "Either nothing has been published here yet, or this token doesn't correspond to a Haven community. Double-check the link."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((video) => (
            <Link
              key={video.id}
              href={`/watch?v=${encodeURIComponent(video.id)}`}
              className="group block border border-line bg-card p-4 hover:border-line-strong hover:bg-accent transition-colors duration-300"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <h3 className="text-small font-medium text-fg group-hover:text-seal-text transition-colors line-clamp-2 leading-snug tracking-[-0.01em]">
                  {video.title}
                </h3>
                {video.isEncrypted && (
                  <span
                    className="shrink-0 label-seal text-nano font-[family-name:var(--font-ledger)]"
                    title="Encrypted"
                  >
                    &#x1f512;
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1 text-xs text-fg-4">
                <HolderIdentity
                  address={video.creatorAddress}
                  gateToken={video.gateToken}
                  gateChain={video.gateChain}
                  verified={video.verified}
                  size="sm"
                  showTokenId
                />
              </div>

              <div className="mt-3 pt-2 border-t border-line-soft flex items-center gap-2 text-nano font-[family-name:var(--font-ledger)] tracking-[0.06em] uppercase text-fg-5">
                <span className="truncate addr !text-[0.625rem] !normal-case">
                  {video.gateToken.slice(0, 8)}…
                </span>
                <span aria-hidden>·</span>
                <span>{video.gateChain}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function CommunityContent() {
  const searchParams = useSearchParams()
  const gateToken = searchParams.get('c')

  if (!gateToken) {
    return <CommunityListContent />
  }

  return <CommunityFeedContent />
}

export default function CommunityPage() {
  return (
    <ProtectedRoute>
      <LibraryLayout>
        <div className="p-6 max-w-[1560px]">
          <header className="section-head mb-8">
            <div className="section-head-meta">
              <span className="folio">02</span>
              <span className="section-head-rule" aria-hidden="true" />
              <h1 className="statement-title text-fg">Community</h1>
            </div>
            <span className="section-head-annotation label hidden sm:block">
              Token-gated zones
            </span>
          </header>
          <Suspense fallback={<Spinner note="Consulting the register" />}>
            <CommunityContent />
          </Suspense>
        </div>
      </LibraryLayout>
    </ProtectedRoute>
  )
}
