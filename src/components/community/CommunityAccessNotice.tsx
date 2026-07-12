'use client'

import { Info, ExternalLink } from 'lucide-react'
import type { TokenGate } from '@/types/attestation'

export interface CommunityAccessNoticeProps {
  /** The token gate the visitor is trying to view. May be partial (chain
   *  unknown) when the user arrived via a direct link and we only have the
   *  contract address from the URL. */
  gate: TokenGate | null
  /** Raw `?c=` value from the URL — used as a fallback when `gate` is null. */
  gateTokenAddress: string
  /** True if this user is a recognized member of the community (i.e. they've
   *  uploaded into it themselves). When true, we hide the notice — they
   *  already know what's going on. */
  isMember: boolean
  /** True once the verified-feed query has at least one entry. Some
   *  non-holders may still be able to *see* community videos (titles), but
   *  they won't be able to play them. We surface that explicitly. */
  hasFeedContent: boolean
}

/**
 * Banner shown on the community detail page to visitors who arrived via a
 * shared link rather than by uploading into the community themselves.
 *
 * Why this exists: communities on Haven are defined by a token gate (ERC-20
 * or NFT). The community feed page is public — anyone with the link can see
 * video titles. But playback requires the user to actually hold the token,
 * and that check happens deep in the decrypt flow (`haven-aol`) with errors
 * like `INSUFFICIENT_BALANCE` that surface only after the user clicks Play.
 *
 * Without this notice, a non-holder would see the community feed, click a
 * video, sign a wallet message, and only then learn they can't watch it. The
 * notice tells them up-front:
 *   1. This is a token-gated community.
 *   2. Which token (address + chain).
 *   3. They need to hold it to play videos.
 */
export function CommunityAccessNotice({
  gate,
  gateTokenAddress,
  isMember,
  hasFeedContent,
}: CommunityAccessNoticeProps) {
  if (isMember) return null

  const tokenAddress = gate?.tokenAddress ?? gateTokenAddress
  const chain = gate?.chain
  const threshold = gate?.threshold

  // We can only build a meaningful block-explorer link when we know the
  // chain. For unknown chains we still show the address; the user can copy
  // it manually.
  const explorerHref = chain ? buildExplorerUrl(chain, tokenAddress) : null

  return (
    <div className="mb-6 rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-400/10 flex items-center justify-center mt-0.5">
          <Info className="w-4 h-4 text-amber-300/90" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium text-amber-100/90 mb-1">
            Token-gated community
          </h3>
          <p className="text-sm text-amber-100/60 leading-relaxed">
            {hasFeedContent
              ? 'You can browse this community, but playing any video requires holding the token below.'
              : "You don't appear to belong to this community yet. To play its videos you'll need to hold the token below."}
          </p>

          <dl className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <dt className="text-amber-100/40 uppercase tracking-wide">
                Token
              </dt>
              <dd className="mt-1 font-mono text-amber-100/80 flex items-center gap-1.5 break-all">
                <span title={tokenAddress}>
                  {tokenAddress.slice(0, 8)}…{tokenAddress.slice(-6)}
                </span>
                {explorerHref && (
                  <a
                    href={explorerHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-amber-300/70 hover:text-amber-200 transition-colors"
                    title="View on block explorer"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-amber-100/40 uppercase tracking-wide">
                Chain
              </dt>
              <dd className="mt-1 text-amber-100/80">
                {chain || (
                  <span className="text-amber-100/40 italic">
                    unknown (resolves on play)
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-amber-100/40 uppercase tracking-wide">
                Minimum held
              </dt>
              <dd className="mt-1 text-amber-100/80">
                {threshold !== undefined ? threshold : '≥ 1'}
              </dd>
            </div>
          </dl>

          <p className="mt-3 text-xs text-amber-100/40 leading-relaxed">
            Don&apos;t hold the token? You can still browse titles, but
            playback will fail with an &quot;insufficient balance&quot;
            message. Acquire the token on its native chain to unlock the
            content.
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * Best-effort mapping from a Haven `gate_chain` value to a block-explorer
 * token URL. Returns `null` for chains we don't recognize so the caller
 * gracefully hides the link.
 *
 * This intentionally accepts both Haven canonical names (e.g. `EthMainnet`)
 * and lower-case aliases (e.g. `ethereum`) since attestation payloads have
 * carried both shapes historically.
 */
function buildExplorerUrl(chain: string, tokenAddress: string): string | null {
  const c = chain.toLowerCase()

  if (c === 'ethmainnet' || c === 'ethereum' || c === 'eth' || c === 'mainnet') {
    return `https://etherscan.io/token/${tokenAddress}`
  }
  if (c === 'base' || c === 'basemainnet') {
    return `https://basescan.org/token/${tokenAddress}`
  }
  if (c === 'optimism' || c === 'op' || c === 'opmainnet') {
    return `https://optimistic.etherscan.io/token/${tokenAddress}`
  }
  if (c === 'arbitrum' || c === 'arb' || c === 'arbitrumone') {
    return `https://arbiscan.io/token/${tokenAddress}`
  }
  if (c === 'polygon' || c === 'matic') {
    return `https://polygonscan.com/token/${tokenAddress}`
  }
  if (c === 'sepolia') {
    return `https://sepolia.etherscan.io/token/${tokenAddress}`
  }

  return null
}
