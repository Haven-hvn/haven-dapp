'use client'

import { useCollectionMeta } from '@/hooks/useHolderNft'
import type { TokenGate } from '@/types/attestation'
import { cn } from '@/lib/utils'

export interface CommunityCardProps {
  gate: TokenGate
  onClick: (gate: TokenGate) => void
}

/** Map a haven-aol chain name to its protocol hue class. */
function chainHueClass(chain: string): string {
  const c = chain.toLowerCase()
  if (c.includes('sepolia') || c.includes('mainnet') || c === 'ethereum')
    return 'net-evm'
  if (c.includes('base')) return 'net-evm'
  // haven-aol VALID_CHAINS are all EVM RPC chains served by DFINITY
  return 'net-evm'
}

function hexLabel(addr: string): string {
  return `${addr.slice(2, 4).toUpperCase()}`
}

export function CommunityCard({ gate, onClick }: CommunityCardProps) {
  const { data: meta } = useCollectionMeta(gate.tokenAddress, gate.chain)
  const hasCollectionImage = !!meta?.image

  return (
    <button
      onClick={() => onClick(gate)}
      className="group block w-full text-left border border-line bg-card p-5 hover:border-line-strong hover:bg-accent transition-colors duration-300"
    >
      <div className="flex items-center gap-4">
        {/* The zone's icon is its gating collection — HolderIdentity made public. */}
        <div className="w-12 h-12 overflow-hidden bg-surface-deep border border-line-strong flex items-center justify-center flex-shrink-0">
          {hasCollectionImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={meta!.image!} alt="" className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <span className="text-small font-[family-name:var(--font-ledger)] font-medium text-fg-4">{hexLabel(gate.tokenAddress)}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-small font-medium text-fg group-hover:text-seal-text transition-colors truncate tracking-[-0.01em]">
            {meta?.name ? meta.name : `${gate.tokenAddress.slice(0, 6)}...${gate.tokenAddress.slice(-4)}`}
          </p>
          <p className="addr truncate mt-1">{gate.tokenAddress.slice(0, 10)}…{gate.tokenAddress.slice(-6)}</p>
          <div className="flex items-center gap-2 mt-2">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 border border-line text-nano font-[family-name:var(--font-ledger)] uppercase tracking-[0.12em] text-fg-3">
              <span className={cn('net-dot', chainHueClass(gate.chain))} />
              {gate.chain}
            </span>
            {meta?.name && (
              <span className="label text-fg-5">{gate.chain}</span>
            )}
          </div>
        </div>
        <svg className="w-5 h-5 text-fg-5 group-hover:text-seal transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  )
}
