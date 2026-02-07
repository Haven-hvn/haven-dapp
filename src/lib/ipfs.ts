/**
 * IPFS Utilities
 * 
 * Provides IPFS gateway configuration, URL building, and retrieval utilities.
 * Supports multiple gateway fallback for reliable content fetching.
 * 
 * @module lib/ipfs
 */

// ============================================================================
// Configuration
// ============================================================================

/**
 * Default IPFS gateways in priority order.
 * These are public gateways that can be used for fetching content.
 */
export const IPFS_GATEWAYS = [
  'https://ipfs.io/ipfs/',
  'https://gateway.ipfs.io/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
  'https://dweb.link/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
]

/**
 * Configuration options for IPFS operations.
 */
export interface IpfsConfig {
  /** Primary gateway URL */
  primaryGateway: string
  /** Fallback gateway URLs */
  fallbackGateways: string[]
  /** Request timeout in milliseconds */
  timeout: number
  /** Number of retry attempts per gateway */
  retries: number
}

// ============================================================================
// Configuration Functions
// ============================================================================

/**
 * Get the IPFS configuration from environment or defaults.
 * 
 * @returns IpfsConfig object with gateway URLs and timeouts
 * 
 * @example
 * ```typescript
 * const config = getIpfsConfig()
 * console.log(config.primaryGateway) // 'https://ipfs.io/ipfs/'
 * ```
 */
export function getIpfsConfig(): IpfsConfig {
  const primaryGateway = process.env.NEXT_PUBLIC_IPFS_GATEWAY || IPFS_GATEWAYS[0]
  
  // Filter out the primary gateway from fallbacks to avoid duplicates
  const fallbackGateways = IPFS_GATEWAYS.filter(gw => gw !== primaryGateway)
  
  return {
    primaryGateway,
    fallbackGateways,
    timeout: 30000, // 30 seconds
    retries: 3,
  }
}

/**
 * Validate a CID format.
 * Basic validation - checks for non-empty string with valid characters.
 * 
 * @param cid - The CID to validate
 * @returns True if the CID appears valid
 */
export function isValidCid(cid: string | null | undefined): boolean {
  if (!cid || typeof cid !== 'string') {
    return false
  }
  
  // Remove any ipfs:// prefix or leading slashes
  const normalized = cid.replace(/^ipfs:\/\//, '').replace(/^\//, '')
  
  // Basic CID validation: non-empty and contains valid characters
  // CIDs typically start with Qm (v0) or are base32 encoded (v1)
  if (normalized.length < 4) {
    return false
  }
  
  // Check for valid CID characters (base58, base32, or base36)
  const validPattern = /^[a-zA-Z0-9]+$/
  return validPattern.test(normalized)
}

// ============================================================================
// URL Building
// ============================================================================

/**
 * Normalize a CID by removing prefixes and leading slashes.
 * 
 * @param cid - The CID to normalize
 * @returns Normalized CID string
 * 
 * @example
 * ```typescript
 * normalizeCid('ipfs://Qmabc123') // 'Qmabc123'
 * normalizeCid('/Qmabc123') // 'Qmabc123'
 * ```
 */
export function normalizeCid(cid: string): string {
  return cid.replace(/^ipfs:\/\//, '').replace(/^\//, '')
}

/**
 * Build a complete IPFS gateway URL from a CID.
 * 
 * @param cid - The IPFS content identifier
 * @param gateway - Optional gateway URL (uses primary if not provided)
 * @returns Complete URL for fetching the content
 * 
 * @example
 * ```typescript
 * const url = buildIpfsUrl('Qmabc123')
 * // 'https://ipfs.io/ipfs/Qmabc123'
 * 
 * const url = buildIpfsUrl('Qmabc123', 'https://gateway.pinata.cloud/ipfs/')
 * // 'https://gateway.pinata.cloud/ipfs/Qmabc123'
 * ```
 */
export function buildIpfsUrl(cid: string, gateway?: string): string {
  const config = getIpfsConfig()
  const gw = gateway || config.primaryGateway
  
  // Ensure gateway ends with a slash
  const normalizedGateway = gw.endsWith('/') ? gw : `${gw}/`
  
  // Remove any ipfs:// prefix or leading slashes from CID
  const normalizedCid = normalizeCid(cid)
  
  return `${normalizedGateway}${normalizedCid}`
}

/**
 * Build IPFS gateway URLs for all available gateways.
 * Useful for trying multiple gateways in parallel or sequence.
 * 
 * @param cid - The IPFS content identifier
 * @returns Array of URLs for all configured gateways
 * 
 * @example
 * ```typescript
 * const urls = buildIpfsUrls('Qmabc123')
 * // [
 * //   'https://ipfs.io/ipfs/Qmabc123',
 * //   'https://gateway.ipfs.io/ipfs/Qmabc123',
 * //   ...
 * // ]
 * ```
 */
export function buildIpfsUrls(cid: string): string[] {
  const config = getIpfsConfig()
  const allGateways = [config.primaryGateway, ...config.fallbackGateways]
  
  return allGateways.map(gateway => buildIpfsUrl(cid, gateway))
}

// ============================================================================
// Path Building
// ============================================================================

/**
 * Build an IPFS URL with a sub-path for accessing files within a directory.
 * 
 * @param cid - The root CID (typically a directory)
 * @param path - Path within the directory
 * @param gateway - Optional gateway URL
 * @returns Complete URL for the nested path
 * 
 * @example
 * ```typescript
 * const url = buildIpfsPathUrl('QmDir123', 'video.mp4')
 * // 'https://ipfs.io/ipfs/QmDir123/video.mp4'
 * ```
 */
export function buildIpfsPathUrl(
  cid: string, 
  path: string, 
  gateway?: string
): string {
  const baseUrl = buildIpfsUrl(cid, gateway)
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path
  
  return `${baseUrl}/${normalizedPath}`
}

// ============================================================================
// Gateway Health Check
// ============================================================================

/**
 * Check if a gateway is responsive by making a HEAD request.
 * 
 * @param gatewayUrl - The gateway URL to check
 * @param timeoutMs - Timeout in milliseconds
 * @returns Promise resolving to true if gateway is healthy
 */
export async function isGatewayHealthy(
  gatewayUrl: string, 
  timeoutMs: number = 5000
): Promise<boolean> {
  try {
    // Use a well-known CID for health check (IPFS logo)
    const testCid = 'QmQ2r6iMNpky9bM5CekRZB3H1z1PB5sVCiL8SMMrK1FVHj'
    const testUrl = buildIpfsUrl(testCid, gatewayUrl)
    
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    
    try {
      const response = await fetch(testUrl, {
        method: 'HEAD',
        signal: controller.signal,
      })
      
      return response.ok
    } finally {
      clearTimeout(timeoutId)
    }
  } catch {
    return false
  }
}

/**
 * Get a list of healthy gateways from the configured list.
 * 
 * @param timeoutMs - Timeout for each health check
 * @returns Promise resolving to array of healthy gateway URLs
 */
export async function getHealthyGateways(timeoutMs: number = 5000): Promise<string[]> {
  const config = getIpfsConfig()
  const allGateways = [config.primaryGateway, ...config.fallbackGateways]
  
  const healthChecks = allGateways.map(async (gateway) => ({
    gateway,
    healthy: await isGatewayHealthy(gateway, timeoutMs),
  }))
  
  const results = await Promise.all(healthChecks)
  
  return results
    .filter(result => result.healthy)
    .map(result => result.gateway)
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error thrown when IPFS operations fail.
 */
export class IpfsError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cid?: string,
    public readonly gateway?: string
  ) {
    super(message)
    this.name = 'IpfsError'
  }
}

/**
 * Get a user-friendly error message for an IPFS error.
 * 
 * @param error - The error to get a message for
 * @returns User-friendly error message
 */
export function getIpfsErrorMessage(error: unknown): string {
  if (error instanceof IpfsError) {
    switch (error.code) {
      case 'INVALID_CID':
        return 'Invalid content identifier. Please check the video CID.'
      case 'FETCH_FAILED':
        return 'Failed to fetch video from storage. Please try again.'
      case 'TIMEOUT':
        return 'Request timed out. The network may be slow or unavailable.'
      case 'ALL_GATEWAYS_FAILED':
        return 'All storage gateways failed. Please check your connection.'
      case 'ABORTED':
        return 'Request was cancelled.'
      default:
        return error.message || 'An unexpected IPFS error occurred.'
    }
  }
  
  if (error instanceof Error) {
    if (error.name === 'AbortError' || error.message.includes('aborted')) {
      return 'Request was cancelled.'
    }
    return error.message
  }
  
  return 'An unexpected error occurred while fetching content.'
}
