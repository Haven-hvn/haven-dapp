'use client'

import { useCollectionMeta } from '@/hooks/useHolderNft'
import type { TokenGate } from '@/types/attestation'

export interface CommunityCardProps {
  gate: TokenGate
  onClick: (gate: TokenGate) => void
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
      className="group block w-full text-left rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 hover:bg-white/[0.04] hover:border-white/[0.12] transition-colors duration-200"
    >
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-md overflow-hidden bg-white/[0.04] border border-white/[0.06] flex items-center justify-center flex-shrink-0">
          {hasCollectionImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={meta!.image!} alt="" className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <span className="text-sm font-mono font-semibold text-white/40">{hexLabel(gate.tokenAddress)}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white/80 group-hover:text-white transition-colors truncate">
            {meta?.name ? meta.name : `${gate.tokenAddress.slice(0, 6)}...${gate.tokenAddress.slice(-4)}`}
          </p>
          <p className="text-xs font-mono text-white/30 truncate">{gate.tokenAddress.slice(0, 10)}…{gate.tokenAddress.slice(-6)}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-xs text-white/50">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/60" />
              {gate.chain}
            </span>
            {meta?.name && (
              <span className="text-xs text-white/25 truncate">{gate.chain}</span>
            )}
          </div>
        </div>
        <svg className="w-5 h-5 text-white/30 group-hover:text-white/50 transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  )
}
