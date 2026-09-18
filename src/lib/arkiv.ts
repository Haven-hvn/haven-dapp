/**
 * Arkiv SDK Client Configuration
 * 
 * Provides a TypeScript client for querying Arkiv blockchain entities.
 * Uses @arkiv-network/sdk with a public client for read-only operations.
 * 
 * IMPORTANT: All Arkiv queries MUST go through the SDK, not via direct
 * HTTP calls or blockchain RPC. The SDK handles query formatting,
 * pagination, and entity parsing correctly.
 */

import {
  createPublicClient,
  type Entity,
  type PublicArkivClient,
  NoEntityFoundError,
} from '@arkiv-network/sdk'
import { http, type Hex, type Transport, type Chain } from 'viem'
import { tiramisu } from '@arkiv-network/sdk/chains'
import { toAttributeRecord } from './arkiv-attrs'
import {
  parseCreatedAtBlock,
  pickLatestArkivEntity,
} from './arkiv-recency'

// ============================================================================
// Configuration
// ============================================================================

const ARKIV_RPC_URL = process.env.NEXT_PUBLIC_ARKIV_RPC_URL ||
  'https://rpc.tiramisu.db-chain.testnet.arkiv.network'

// ============================================================================
// Types
// ============================================================================

/**
 * Arkiv entity type (matches SDK response).
 */
export interface ArkivEntity {
  key: string
  owner: string
  attributes: Record<string, unknown>
  payload: string // Base64 encoded JSON
  content_type: string
  /** `$createdAtBlock` as decimal string (legacy wire field) */
  created_at: string
  /** Arkiv creation block height — canonical recency key */
  created_at_block: number
}

/**
 * Options for querying entities.
 */
export interface ArkivQueryOptions {
  /** Maximum number of results to return per page */
  maxResults?: number
  /** Cursor for pagination */
  cursor?: string
  /** Include payload data */
  includePayload?: boolean
  /** Include attributes */
  includeAttributes?: boolean
  /** Include metadata (owner, created_at, etc.) */
  includeMetadata?: boolean
}

/**
 * Connection status for the Arkiv client.
 */
export interface ArkivConnectionStatus {
  isConnected: boolean
  error?: string
  blockNumber?: bigint
  blockTime?: number
}

/**
 * Custom error class for Arkiv operations.
 */
export class ArkivError extends Error {
  constructor(
    message: string,
    public code?: string,
    public cause?: Error
  ) {
    super(message)
    this.name = 'ArkivError'
  }
}

// ============================================================================
// Client Creation
// ============================================================================

/**
 * Create an Arkiv SDK public client for querying entities.
 * 
 * This client is optimized for browser environments and read-only operations.
 * For read-only queries, no private key is required.
 * 
 * @returns A PublicArkivClient instance configured for the Tiramisu chain
 * 
 * @example
 * ```typescript
 * const client = createArkivClient()
 * const entity = await client.getEntity('0x123...')
 * ```
 */
export function createArkivClient(): PublicArkivClient<Transport, Chain | undefined, undefined> {
  // Use custom transport if ARKIV_RPC_URL is provided, otherwise use default
  const transport = http(ARKIV_RPC_URL)
  
  return createPublicClient({
    chain: tiramisu,
    transport,
  }) as PublicArkivClient<Transport, Chain | undefined, undefined>
}

// ============================================================================
// Query Operations
// ============================================================================

/**
 * Query entities by owner address using the Arkiv SDK.
 * 
 * @param client - The Arkiv public client instance
 * @param ownerAddress - The Ethereum address of the owner
 * @param options - Optional query parameters
 * @returns Array of entities owned by the specified address
 * 
 * @example
 * ```typescript
 * const client = createArkivClient()
 * const entities = await queryEntitiesByOwner(client, '0x123...', { maxResults: 10 })
 * ```
 */
export async function queryEntitiesByOwner(
  client: PublicArkivClient<Transport, Chain | undefined, undefined>,
  ownerAddress: string,
  options: ArkivQueryOptions = {}
): Promise<ArkivEntity[]> {
  const {
    maxResults = 50,
    cursor,
    includePayload = true,
    includeAttributes = true,
  } = options

  // Identity fields are always selected (cheap, and transformEntity needs
  // owner + creation block); payload/attributes honor the include flags so
  // list rows never over-fetch sealed bytes.
  const selection: Record<string, boolean> = {
    key: true,
    owner: true,
    creator: true,
    createdAt: true,
    contentType: true,
  }
  if (includeAttributes) selection.attributes = true
  if (includePayload) selection.payload = true

  try {
    const builder = client
      .select(selection)
      .ownedBy(ownerAddress.toLowerCase() as Hex)
      .limit(maxResults)
    if (cursor) builder.cursor(cursor)
    const result = await builder.fetch()

    // Transform SDK Entity to our ArkivEntity format
    return result.entities.map(transformEntity)
  } catch (error) {
    throw new ArkivError(
      error instanceof Error ? error.message : 'Failed to query entities',
      'QUERY_ERROR',
      error instanceof Error ? error : undefined
    )
  }
}

/**
 * Get a single entity by its key.
 * 
 * @param client - The Arkiv public client instance
 * @param entityKey - The unique key of the entity
 * @returns The entity if found, null otherwise
 */
export async function getEntity(
  client: PublicArkivClient<Transport, Chain | undefined, undefined>,
  entityKey: string
): Promise<ArkivEntity | null> {
  try {
    const entity: Entity = await client.getEntity(entityKey as `0x${string}`)

    if (!entity) {
      return null
    }

    return transformEntity(entity)
  } catch (error) {
    // 0.8 throws on missing keys where 0.7 returned empty — preserve the
    // historical null-on-missing contract for existing callers.
    if (error instanceof NoEntityFoundError) {
      return null
    }
    throw new ArkivError(
      error instanceof Error ? error.message : 'Failed to get entity',
      'GET_ERROR',
      error instanceof Error ? error : undefined
    )
  }
}

/**
 * Check the connection status to the Arkiv network.
 * 
 * @returns Connection status with block information
 */
export async function checkArkivConnection(): Promise<ArkivConnectionStatus> {
  try {
    const client = createArkivClient()
    const blockTiming = await client.getBlockTiming()
    
    return {
      isConnected: true,
      blockNumber: blockTiming.currentBlock,
      blockTime: blockTiming.currentBlockTime,
    }
  } catch (error) {
    return {
      isConnected: false,
      error: error instanceof Error ? error.message : 'Unknown connection error',
    }
  }
}

/**
 * Get all entities for an owner (handles pagination automatically).
 * 
 * @param client - The Arkiv public client instance
 * @param ownerAddress - The Ethereum address of the owner
 * @param maxResults - Maximum total results to fetch (default: 1000)
 * @returns Array of all entities owned by the specified address
 */
export async function getAllEntitiesByOwner(
  client: PublicArkivClient<Transport, Chain | undefined, undefined>,
  ownerAddress: string,
  maxResults: number = 1000
): Promise<ArkivEntity[]> {
  const allEntities: ArkivEntity[] = []
  let cursor: string | undefined
  let hasMore = true
  
  while (hasMore && allEntities.length < maxResults) {
    const pageSize = Math.min(50, maxResults - allEntities.length)

    try {
      const builder = client
        .select()
        .ownedBy(ownerAddress.toLowerCase() as Hex)
        .limit(pageSize)
      if (cursor) builder.cursor(cursor)
      const result = await builder.fetch()
      const entities = result.entities.map(transformEntity)
      
      allEntities.push(...entities)
      cursor = result.cursor
      hasMore = !!result.cursor && entities.length > 0
    } catch (error) {
      throw new ArkivError(
        error instanceof Error ? error.message : 'Failed to fetch all entities',
        'FETCH_ALL_ERROR',
        error instanceof Error ? error : undefined
      )
    }
  }
  
  return allEntities
}

/**
 * Get the single most recently created entity for an owner.
 *
 * SDK 0.8 has no server-side ordering, so this fetches the owner's recent
 * page and picks the highest creation block client-side.
 */
export async function getLatestEntityByOwner(
  client: PublicArkivClient<Transport, Chain | undefined, undefined>,
  ownerAddress: string
): Promise<ArkivEntity | null> {
  try {
    const recent = await queryEntitiesByOwner(client, ownerAddress, {
      maxResults: 100,
      includePayload: false,
      includeAttributes: true,
      includeMetadata: true,
    })
    return pickLatestArkivEntity(recent)
  } catch (error) {
    throw new ArkivError(
      error instanceof Error ? error.message : 'Failed to fetch latest entity',
      'FETCH_LATEST_ERROR',
      error instanceof Error ? error : undefined
    )
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Minimal structural view of an SDK entity — satisfied by the SDK 0.8
 * `Entity`/`FullEntity` (and tolerant of legacy/test shapes).
 */
interface RawSdkEntity {
  key?: unknown
  owner?: unknown
  payload?: unknown
  contentType?: unknown
  attributes?: unknown
  /** SDK 0.8 creation block. */
  createdAt?: unknown
  /** Legacy 0.7 creation block field. */
  createdAtBlock?: unknown
}

/**
 * Transform an SDK Entity to our ArkivEntity format.
 *
 * @param entity - The SDK Entity
 * @returns Transformed ArkivEntity
 */
function transformEntity(entity: Entity): ArkivEntity {
  const raw = entity as unknown as RawSdkEntity

  // Convert payload from Uint8Array to base64 string
  let payload = ''
  if (raw.payload instanceof Uint8Array) {
    const bytes = new Uint8Array(raw.payload)
    const binary = bytes.reduce((acc, byte) => acc + String.fromCharCode(byte), '')
    payload = typeof window !== 'undefined'
      ? btoa(binary)
      : Buffer.from(bytes).toString('base64')
  } else if (typeof raw.payload === 'string') {
    payload = raw.payload
  }

  // Normalize the SDK 0.8 tagged map (or a legacy array) to a record
  const attributes = toAttributeRecord(raw.attributes)

  // Get content type from entity or attributes
  const contentType = (typeof raw.contentType === 'string' && raw.contentType) ||
    (attributes.contentType as string) ||
    'application/octet-stream'

  const createdRaw = (raw.createdAt ?? raw.createdAtBlock) as
    | string
    | number
    | bigint
    | undefined
    | null
  const createdAtBlock = parseCreatedAtBlock(createdRaw)

  return {
    key: typeof raw.key === 'string' ? raw.key : String(raw.key ?? ''),
    owner: typeof raw.owner === 'string' ? raw.owner : '',
    attributes,
    payload,
    content_type: contentType,
    created_at:
      typeof createdRaw === 'bigint'
        ? createdRaw.toString()
        : String(createdRaw ?? ''),
    created_at_block: createdAtBlock,
  }
}

/**
 * Parse entity payload from Base64 JSON string.
 * 
 * @param payload - Base64 encoded JSON string
 * @returns Parsed JSON object
 */
export function parseEntityPayload<T = unknown>(payload: string): T | null {
  try {
    // Try to decode from base64 first
    const decoded = typeof window !== 'undefined' 
      ? atob(payload)
      : Buffer.from(payload, 'base64').toString('utf-8')
    return JSON.parse(decoded) as T
  } catch {
    // If base64 decoding fails, try parsing as regular JSON
    try {
      return JSON.parse(payload) as T
    } catch {
      return null
    }
  }
}

/**
 * Encode payload to Base64 string for storage.
 * 
 * @param data - Data to encode
 * @returns Base64 encoded string
 */
export function encodeEntityPayload<T = unknown>(data: T): string {
  const jsonString = JSON.stringify(data)
  return typeof window !== 'undefined'
    ? btoa(jsonString)
    : Buffer.from(jsonString).toString('base64')
}
