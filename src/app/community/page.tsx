'use client'

import { Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useUserCommunities, useCommunityFeedForGate } from '@/hooks/useCommunityFeed'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { LibraryLayout } from '@/components/layout/LibraryLayout'
import { CommunityCard } from '@/components/community/CommunityCard'
import Link from 'next/link'
import type { TokenGate } from '@/types/attestation'

function CommunityListContent() {
  const router = useRouter()
  const { communities, isLoading, error, refetch } = useUserCommunities()

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

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {communities.map((gate) => (
        <CommunityCard
          key={`${gate.chain}:${gate.tokenAddress}`}
          gate={gate}
          onClick={handleCommunityClick}
        />
      ))}
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
    ? communities.find((g) => g.tokenAddress === gateToken) ?? null
    : null

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
            {gate
              ? `${gate.tokenAddress.slice(0, 6)}...${gate.tokenAddress.slice(-4)}`
              : `${gateToken.slice(0, 6)}...${gateToken.slice(-4)}`}
            {gate && <span className="text-white/30">({gate.chain})</span>}
          </span>
        </div>
      </div>

      {videos.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-white/40">No community content yet for this gate.</p>
          <p className="text-sm text-white/25 mt-1">
            Content will appear here when community members upload gated videos.
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

              <div className="flex items-center gap-2 text-xs text-white/40">
                <span className="font-mono">
                  {video.creatorAddress.slice(0, 6)}...{video.creatorAddress.slice(-4)}
                </span>
                {video.verified && (
                  <span className="inline-flex items-center gap-0.5 text-emerald-400/80">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Verified
                  </span>
                )}
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
