'use client'

import { useQuery } from '@tanstack/react-query'
import { fetchHolderNft, fetchCollectionMeta, type HolderNft } from '@/lib/nft'

export function useHolderNft(
  owner: string | null | undefined,
  contractAddress: string | null | undefined,
  chain: string | null | undefined
) {
  const enabled = !!owner && !!contractAddress && !!chain
  return useQuery<HolderNft | null>({
    queryKey: ['holder-nft', owner?.toLowerCase(), contractAddress?.toLowerCase(), chain],
    queryFn: ({ signal }) => fetchHolderNft(owner!, contractAddress!, chain!, signal as AbortSignal),
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    retry: false,
  })
}

export function useCollectionMeta(
  contractAddress: string | null | undefined,
  chain: string | null | undefined
) {
  const enabled = !!contractAddress && !!chain
  return useQuery<{ name: string | null; image: string | null } | null>({
    queryKey: ['collection-meta', contractAddress?.toLowerCase(), chain],
    queryFn: ({ signal }) => fetchCollectionMeta(contractAddress!, chain!, signal as AbortSignal),
    enabled,
    staleTime: 10 * 60 * 1000,
    retry: false,
  })
}
