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
import type { TokenGate } from '@/types/attestation'

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-white/50">Discovering your communities...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center max-w-md">
          <p className="text-red-400 mb-2">Failed to load communities</p>
          <p className="text-sm text-white/40 mb-4">{error.message}</p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!communities.length) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-white/[0.04] flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-white/80 mb-2">No communities yet</h3>
          <p className="text-sm text-white/40">
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
      <div className="flex items-center gap-3 mb-4">
        <label className="text-xs text-white/50">Gating chain</label>
        <select
          value={gatingChain}
          onChange={e => setGatingChain(e.target.value)}
          className="px-2 py-1.5 rounded-md bg-white/[0.06] border border-white/[0.08] text-xs text-white/80"
          title="haven-aol VALID_CHAINS — DFINITY EVM RPC"
        >
          <option value="all">All chains</option>
          <option value="EthMainnet">EthMainnet</option>
          <option value="BaseMainnet">BaseMainnet</option>
          <option value="ArbitrumOne">ArbitrumOne</option>
          <option value="OptimismMainnet">OptimismMainnet</option>
          <option value="EthSepolia">EthSepolia</option>
        </select>
        <span className="text-xs text-white/30">{filtered.length} DAOs · RPC via DFINITY</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((gate) => (
          <CommunityCard
            key={`${gate.chain}:${gate.tokenAddress}`}
            gate={gate}
            onClick={handleCommunityClick}
          />
        ))}
      </div>
      {!filtered.length && communities.length > 0 && (
        <p className="text-sm text-white/40 mt-4">No communities on {gatingChain}.</p>
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-white/50">Loading community videos...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center max-w-md">
          <p className="text-red-400 mb-2">Failed to load community feed</p>
          <p className="text-sm text-white/40 mb-4">{error.message}</p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => router.push('/community')}
          className="flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-xs text-white/60">
            <span className="w-2 h-2 rounded-full bg-emerald-400/60" />
            {displayGate
              ? `${displayGate.tokenAddress.slice(0, 6)}...${displayGate.tokenAddress.slice(-4)}`
              : `${gateToken.slice(0, 6)}...${gateToken.slice(-4)}`}
            {displayGate?.chain && (
              <span className="text-white/30">({displayGate.chain})</span>
            )}
          </span>
        </div>
      </div>

      <CommunityAccessNotice
        gate={displayGate}
        gateTokenAddress={gateToken}
        isMember={isMember}
        hasFeedContent={videos.length > 0}
      />

      {videos.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-white/40">No community content yet for this gate.</p>
          <p className="text-sm text-white/25 mt-1">
            {isMember
              ? 'Content will appear here when community members upload gated videos.'
              : "Either nothing has been published here yet, or this token doesn't correspond to a Haven community. Double-check the link."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((video) => (
            <Link
              key={video.id}
              href={`/watch?v=${encodeURIComponent(video.id)}`}
              className="group block rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 hover:bg-white/[0.04] hover:border-white/[0.12] transition-all duration-200"
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-sm font-medium text-white/80 group-hover:text-white transition-colors line-clamp-2">
                  {video.title}
                </h3>
                {video.isEncrypted && (
                  <span className="ml-2 flex-shrink-0 text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400/80">
                    &#x1f512;
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1 text-xs text-white/40">
                <HolderIdentity
                  address={video.creatorAddress}
                  gateToken={video.gateToken}
                  gateChain={video.gateChain}
                  verified={video.verified}
                  size="sm"
                  showTokenId
                />
              </div>

              <div className="mt-3 flex items-center gap-2 text-xs text-white/25">
                <span className="truncate">
                  {video.gateToken.slice(0, 8)}...
                </span>
                <span>&bull;</span>
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
        <div className="p-6">
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight text-white/90">Community</h1>
            <p className="text-sm text-white/50 mt-1">
              Discover content from your token-gated communities
            </p>
          </div>
          <Suspense fallback={
            <div className="flex items-center justify-center min-h-[400px]">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          }>
            <CommunityContent />
          </Suspense>
        </div>
      </LibraryLayout>
    </ProtectedRoute>
  )
}
