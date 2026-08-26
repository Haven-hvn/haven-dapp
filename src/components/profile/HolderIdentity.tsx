'use client'

import { useMemo } from 'react'
import { useHolderNft } from '@/hooks/useHolderNft'

function blockieDataUrl(address: string): string {
  // minimal deterministic fallback — no external dep
  let h = 0
  for (let i = 0; i < address.length; i++) h = (h * 31 + address.charCodeAt(i)) >>> 0
  const hue = h % 360
  // tiny svg circle with hue + 2-char label
  const label = address.slice(2, 4).toUpperCase()
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="hsl(${hue} 55% 42%)"/><text x="32" y="38" text-anchor="middle" font-family="monospace" font-size="18" font-weight="700" fill="white">${label}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

function shortAddr(a: string): string {
  return `${a.slice(0, 6)}...${a.slice(-4)}`
}

export interface HolderIdentityProps {
  address: string
  gateToken?: string | null
  gateChain?: string | null
  verified?: boolean
  /** visual size */
  size?: 'sm' | 'md' | 'lg'
  /** show tokenId line when NFT resolves */
  showTokenId?: boolean
  /** compact mode — just avatar + address, no extra meta */
  compact?: boolean
  className?: string
}

const sizeMap = {
  sm: { avatar: 'w-6 h-6 text-[10px]', text: 'text-xs', gap: 'gap-1.5' },
  md: { avatar: 'w-7 h-7 text-xs', text: 'text-xs', gap: 'gap-2' },
  lg: { avatar: 'w-9 h-9 text-sm', text: 'text-sm', gap: 'gap-2.5' },
} as const

/**
 * HolderIdentity — NFT collection holder as profile.
 *
 * Uses the collection NFT image (first token owned in gateToken) as avatar.
 * This attestation from haven-aol proves holder at upload time; we surface it visually.
 * Falls back to blockie when Alchemy not configured or not a holder.
 *
 * Anti-slop: no purple gradient, no glass blur, no scale hover — just flat avatar + mono address.
 */
export function HolderIdentity({
  address,
  gateToken,
  gateChain,
  verified,
  size = 'sm',
  showTokenId = false,
  compact = false,
  className = '',
}: HolderIdentityProps) {
  const s = sizeMap[size]
  const { data: nft, isLoading } = useHolderNft(
    gateToken && gateChain ? address : null,
    gateToken ?? null,
    gateChain ?? null
  )

  const avatarSrc = useMemo(() => {
    if ((nft as unknown as { image?: string | null })?.image) return (nft as unknown as { image: string }).image
    return blockieDataUrl(address)
  }, [(nft as unknown as { image?: string | null })?.image, address])

  const label = shortAddr(address)

  return (
    <span className={`inline-flex items-center ${s.gap} min-w-0 ${className}`}>
      <span className={`relative flex-shrink-0 overflow-hidden bg-surface-deep border border-line-strong ${s.avatar} inline-flex items-center justify-center`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatarSrc}
          alt=""
          className="w-full h-full object-cover"
          loading="lazy"
          decoding="async"
          style={{ opacity: isLoading && (nft as unknown as { image?: string | null })?.image ? 0.6 : 1 }}
        />
        {verified && (
          <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[var(--color-arkiv)] border border-surface flex items-center justify-center">
            <svg viewBox="0 0 10 10" className="w-2 h-2 text-white" fill="currentColor" aria-hidden>
              <path d="M2.5 5L4 6.5 7.5 2.5" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          </span>
        )}
      </span>

      <span className={`min-w-0 flex flex-col leading-none ${compact ? '' : ''}`}>
        <span className={`font-[family-name:var(--font-ledger)] text-fg-2 truncate ${s.text}`} title={address}>
          {label}
        </span>
        {!compact && showTokenId && nft?.tokenId && (
          <span className="text-[0.625rem] text-fg-5 font-[family-name:var(--font-ledger)] tracking-[0.04em] truncate">
            #{nft.tokenId} {nft.collectionName ? `· ${nft.collectionName}` : ''}
          </span>
        )}
        {!compact && !showTokenId && verified && (
          <span className="text-[0.5625rem] text-seal-text font-[family-name:var(--font-ledger)] uppercase tracking-[0.14em]">Holder · Verified</span>
        )}
      </span>
    </span>
  )
}

/**
 * Collection avatar — for community cards where holder is not yet known.
 * Shows collection image if Alchemy configured, otherwise generic.
 */
export function CollectionAvatar({
  contractAddress,
  chain,
  size = 48,
}: {
  contractAddress: string
  chain: string
  size?: number
}) {
  const { data: meta } = useHolderNft(null, contractAddress, chain) // will be disabled; use collection meta separately
  // Placeholder: caller should use useCollectionMeta; this is visual stub kept for tree-shake
  void meta
  return (
    <span
      className="overflow-hidden bg-surface-deep border border-line-strong flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <span className="text-fg-4 text-nano font-[family-name:var(--font-ledger)]">
        {contractAddress.slice(2, 4).toUpperCase()}
      </span>
    </span>
  )
}
