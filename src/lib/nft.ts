/**
 * NFT identity helper — fully public, no API key.
 *
 * Haven gates on a collection contract (ERC-721, threshold >=1).
 * Collection image lives on IPFS; its CID is reachable via
 * contractURI() / tokenURI() onchain → fetch via public IPFS gateway.
 * ERC20 logos come from trustwallet assets (public HEAD probe).
 *
 * Holder avatar = collection image for everyone in that DAO (same visual
 * that should hit home for newcomers). When Alchemy key is present we still
 * try per-holder tokenId for extra fidelity, but it is not required.
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

function chainToRpc(chain: string): string {
  const c = chain.toLowerCase()
  if (c === 'base' || c === 'basemainnet' || c === '8453' || c === 'basesepolia' || c === '84532') return 'https://base-rpc.publicnode.com'
  if (c === 'arbitrum' || c === 'arbitrumone' || c === '42161') return 'https://arbitrum-one-rpc.publicnode.com'
  if (c === 'optimism' || c === 'optimismmainnet' || c === '10') return 'https://optimism-rpc.publicnode.com'
  if (c === 'polygon' || c === 'matic' || c === '137') return 'https://polygon-bor-rpc.publicnode.com'
  return 'https://ethereum.publicnode.com'
}

// Minimal ABI for public chain reads
const ERC721_ABI = [
  { name: 'contractURI', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { name: 'tokenURI', type: 'function', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'string' }] },
  { name: 'name', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
] as const

async function viemRead(
  rpcUrl: string,
  contractAddress: string,
  functionName: string,
  args: unknown[] = [],
  signal?: AbortSignal
): Promise<string | null> {
  try {
    const { createPublicClient, http } = await import('viem')
    const client = createPublicClient({ transport: http(rpcUrl) })
    const abiEntry = ERC721_ABI.find((a) => a.name === functionName)
    if (!abiEntry) return null
    const res = (await client.readContract({
      address: contractAddress as `0x${string}`,
      abi: [abiEntry] as unknown as never[],
      functionName: functionName as never,
      args: args as never,
    })) as string
    if (signal?.aborted) return null
    return res ?? null
  } catch {
    return null
  }
}

async function fetchJsonFromUri(uri: string | null, signal?: AbortSignal): Promise<Record<string, unknown> | null> {
  if (!uri) return null
  const url = gatewayNormalize(uri)
  if (!url) return null
  try {
    const res = await fetch(url, { signal, cache: 'no-store' as RequestCache, headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const j = (await res.json()) as Record<string, unknown>
    return j
  } catch {
    return null
  }
}

/**
 * Fully public: resolve collection image from contractURI / tokenURI via public RPC + IPFS gateway.
 * Returns { image, name } or null. Never throws. Caches caller-side via tanstack.
 */
export async function fetchCollectionImagePublic(
  contractAddress: string,
  chain: string,
  signal?: AbortSignal
): Promise<{ image: string | null; name: string | null } | null> {
  if (!contractAddress) return null
  const rpc = chainToRpc(chain)

  // 1) contractURI → JSON → image
  const contractUri = await viemRead(rpc, contractAddress, 'contractURI', [], signal)
  if (contractUri) {
    const json = await fetchJsonFromUri(contractUri, signal)
    if (json) {
      const img = gatewayNormalize((json.image as string | null) ?? (json.image_url as string | null) ?? null)
      const name = (json.name as string | null) ?? null
      if (img) return { image: img, name }
    }
  }
  // 2) tokenURI(1) then tokenURI(0) → JSON → image (covers collections without contractURI)
  for (const tokenId of [1n, 0n]) {
    const uri = await viemRead(rpc, contractAddress, 'tokenURI', [tokenId], signal)
    if (!uri) continue
    const json = await fetchJsonFromUri(uri, signal)
    if (!json) continue
    const img = gatewayNormalize((json.image as string | null) ?? (json.image_url as string | null) ?? null)
    const name = (json.name as string | null) ?? null
    if (img) return { image: img, name }
  }
  // 3) TrustWallet ERC20 logo probe (works for tokens, harmless for NFTs)
  const trustLogo = `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/${contractAddress}/logo.png`
  try {
    const head = await fetch(trustLogo, { method: 'HEAD', signal, cache: 'no-store' as RequestCache })
    if (head.ok) {
      const name = await viemRead(rpc, contractAddress, 'name', [], signal)
      return { image: trustLogo, name: name ?? null }
    }
  } catch {}
  return null
}

/**
 * Fully public holder fetch — returns collection image for any holder (same image for all members of DAO).
 * Keeps HolderNft shape for HolderIdentity compatibility.
 * If Alchemy key present, tries per-holder tokenId for fidelity, otherwise falls back to collection image.
 */
export async function fetchHolderNft(
  owner: string,
  contractAddress: string,
  chain: string,
  signal?: AbortSignal
): Promise<HolderNft | null> {
  if (!owner || !contractAddress) return null

  // Try Alchemy per-holder when key present (more precise tokenId), but not required
  const apiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY?.trim()
  const alchemyRpc = process.env.NEXT_PUBLIC_ALCHEMY_RPC?.trim()
  let key: string | null = apiKey ?? null
  if (!key && alchemyRpc) {
    const m = alchemyRpc.match(/\/v2\/([^/?#]+)/)
    if (m) key = m[1]
  }
  if (key) {
    try {
      const c = chain.toLowerCase()
      let network = 'eth-mainnet'
      if (c === 'base' || c === 'basemainnet' || c === '8453') network = 'base-mainnet'
      else if (c === 'ethsepolia' || c === 'sepolia') network = 'eth-sepolia'
      else if (c === 'arbitrum' || c === 'arbitrumone') network = 'arb-mainnet'
      else if (c === 'optimism' || c === 'optimismmainnet') network = 'opt-mainnet'
      const url =
        `https://${network}.g.alchemy.com/nft/v3/${key}/getNFTsForOwner` +
        `?owner=${encodeURIComponent(owner)}&contractAddresses[]=${encodeURIComponent(contractAddress)}&withMetadata=true&pageSize=1`
      const r = await fetch(url, { signal, cache: 'no-store' as RequestCache })
      if (r.ok) {
        const j = (await r.json()) as {
          ownedNfts?: Array<{
            tokenId: string
            name?: string | null
            contract?: { name?: string | null; address?: string }
            image?: { cachedUrl?: string | null; thumbnailUrl?: string | null; originalUrl?: string | null }
            raw?: { metadata?: { image?: string | null } }
          }>
        }
        const nft = j.ownedNfts?.[0]
        if (nft) {
          const rawImage = nft.image?.cachedUrl ?? nft.image?.thumbnailUrl ?? nft.image?.originalUrl ?? nft.raw?.metadata?.image ?? null
          return {
            tokenId: nft.tokenId,
            name: nft.name ?? null,
            collectionName: nft.contract?.name ?? null,
            image: gatewayNormalize(rawImage),
            contractAddress,
          }
        }
      }
    } catch {}
  }

  // Fully public fallback: collection image via contractURI + IPFS gateway (same for every holder — that *is* the DAO identity)
  const meta = await fetchCollectionImagePublic(contractAddress, chain, signal)
  if (!meta?.image) return null
  return {
    tokenId: '1',
    name: meta.name,
    collectionName: meta.name,
    image: meta.image,
    contractAddress,
  }
}

/**
 * Collection meta (fully public) — used by CommunityCard.
 */
export async function fetchCollectionMeta(
  contractAddress: string,
  chain: string,
  signal?: AbortSignal
): Promise<{ name: string | null; image: string | null } | null> {
  const meta = await fetchCollectionImagePublic(contractAddress, chain, signal)
  if (!meta) return null
  return { name: meta.name, image: meta.image }
}
