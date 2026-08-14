/**
 * NFT identity helper — collection NFT as profile picture.
 *
 * Haven gates on a collection contract (ERC-721, threshold >=1).
 * The holder's specific tokenId image becomes their identity avatar,
 * exactly like a private-tracker avatar.
 *
 * Uses Alchemy NFT API when NEXT_PUBLIC_ALCHEMY_API_KEY is set.
 * Falls back gracefully (null) when not configured — HolderIdentity
 * then shows Blockie/ENS fallback.
 *
 * @module lib/nft
 */

export interface HolderNft {
  tokenId: string
  name: string | null
  collectionName: string | null
  image: string | null // already gateway-normalized
  contractAddress: string
}

function gatewayNormalize(url: string | null): string | null {
  if (!url) return null
  if (url.startsWith('ipfs://')) return url.replace('ipfs://', 'https://ipfs.io/ipfs/')
  if (url.startsWith('ipfs/')) return `https://ipfs.io/${url}`
  return url
}

function chainToAlchemyNetwork(chain: string): string {
  const c = chain.toLowerCase()
  if (c === 'ethmainnet' || c === 'ethereum' || c === 'eth' || c === 'mainnet' || c === '1') return 'eth-mainnet'
  if (c === 'ethsepolia' || c === 'sepolia' || c === '11155111') return 'eth-sepolia'
  if (c === 'base' || c === 'basemainnet' || c === '8453') return 'base-mainnet'
  if (c === 'basesepolia' || c === '84532') return 'base-sepolia'
  if (c === 'arbitrum' || c === 'arbitrumone' || c === '42161' || c === 'arbitrummainnet') return 'arb-mainnet'
  if (c === 'optimism' || c === 'optimismmainnet' || c === 'op' || c === '10') return 'opt-mainnet'
  if (c === 'polygon' || c === 'matic' || c === '137') return 'polygon-mainnet'
  return 'eth-mainnet'
}

/**
 * Fetch the first NFT owned by `owner` in `contractAddress` on `chain`.
 * Returns null when not configured, not a holder, or on error (never throws).
 */
export async function fetchHolderNft(
  owner: string,
  contractAddress: string,
  chain: string,
  signal?: AbortSignal
): Promise<HolderNft | null> {
  const apiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY?.trim()
  const alchemyRpc = process.env.NEXT_PUBLIC_ALCHEMY_RPC?.trim()

  // Try to derive key from RPC URL like https://eth-mainnet.g.alchemy.com/v2/<key>
  let key = apiKey
  if (!key && alchemyRpc) {
    const m = alchemyRpc.match(/\/v2\/([^/?#]+)/)
    if (m) key = m[1]
  }
  if (!key) return null
  if (!owner || !contractAddress) return null

  const network = chainToAlchemyNetwork(chain)
  const url =
    `https://${network}.g.alchemy.com/nft/v3/${key}/getNFTsForOwner` +
    `?owner=${encodeURIComponent(owner)}` +
    `&contractAddresses[]=${encodeURIComponent(contractAddress)}` +
    `&withMetadata=true&pageSize=1`

  try {
    const res = await fetch(url, { signal, cache: 'no-store' as RequestCache })
    if (!res.ok) return null
    const json = (await res.json()) as {
      ownedNfts?: Array<{
        tokenId: string
        name?: string | null
        contract?: { name?: string | null; address?: string }
        image?: { cachedUrl?: string | null; thumbnailUrl?: string | null; originalUrl?: string | null; pngUrl?: string | null }
        raw?: { metadata?: { image?: string | null } }
      }>
    }
    const nft = json.ownedNfts?.[0]
    if (!nft) return null

    const rawImage =
      nft.image?.cachedUrl ??
      nft.image?.thumbnailUrl ??
      nft.image?.pngUrl ??
      nft.image?.originalUrl ??
      nft.raw?.metadata?.image ??
      null

    return {
      tokenId: nft.tokenId,
      name: nft.name ?? null,
      collectionName: nft.contract?.name ?? null,
      image: gatewayNormalize(rawImage),
      contractAddress: nft.contract?.address ?? contractAddress,
    }
  } catch {
    return null
  }
}

/**
 * Fetch collection-level metadata (name/image) for a contract.
 * Used by CommunityCard when no specific holder is available.
 */
export async function fetchCollectionMeta(
  contractAddress: string,
  chain: string,
  signal?: AbortSignal
): Promise<{ name: string | null; image: string | null } | null> {
  const apiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY?.trim()
  const alchemyRpc = process.env.NEXT_PUBLIC_ALCHEMY_RPC?.trim()
  let key = apiKey
  if (!key && alchemyRpc) {
    const m = alchemyRpc.match(/\/v2\/([^/?#]+)/)
    if (m) key = m[1]
  }
  if (!key) return null
  const network = chainToAlchemyNetwork(chain)
  const url = `https://${network}.g.alchemy.com/nft/v3/${key}/getContractMetadata?contractAddress=${encodeURIComponent(contractAddress)}`
  try {
    const res = await fetch(url, { signal, cache: 'no-store' as RequestCache })
    if (!res.ok) return null
    const json = (await res.json()) as {
      name?: string | null
      openSeaMetadata?: { imageUrl?: string | null }
      contractMetadata?: { openSea?: { imageUrl?: string | null } }
    }
    const name = json.name ?? null
    const image = gatewayNormalize(
      json.openSeaMetadata?.imageUrl ?? json.contractMetadata?.openSea?.imageUrl ?? null
    )
    return { name, image }
  } catch {
    return null
  }
}
