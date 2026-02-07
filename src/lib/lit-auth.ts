/**
 * Lit Protocol Authentication Context Helper
 * 
 * Provides utilities for creating authentication contexts for Lit Protocol
 * operations, including EOA (Externally Owned Account) based authentication.
 * 
 * @module lib/lit-auth
 */

import { createAuthManager } from '@lit-protocol/auth'
import { createViemAccount } from './viem-adapter'
import { getLitClient, getAuthManager } from './lit'
import { LitAccessControlConditionResource } from '@lit-protocol/auth-helpers'

/**
 * Error thrown when Lit auth operations fail.
 */
export class LitAuthError extends Error {
  constructor(
    message: string,
    public code: 'CLIENT_NOT_INITIALIZED' | 'AUTH_CONTEXT_FAILED' | 'INVALID_PRIVATE_KEY'
  ) {
    super(message)
    this.name = 'LitAuthError'
  }
}

/**
 * Configuration options for creating a Lit authentication context.
 */
export interface LitAuthContextOptions {
  /** The private key for signing authentication messages */
  privateKey: string
  
  /** The blockchain chain to use for authentication (default: 'ethereum') */
  chain?: string
  
  /** Domain for the SIWE (Sign-In with Ethereum) message */
  domain?: string
  
  /** Custom statement for the SIWE message */
  statement?: string
  
  /** Expiration time in milliseconds from now (default: 1 hour) */
  expirationMs?: number
}

/**
 * Default authentication context options.
 */
const DEFAULT_AUTH_OPTIONS: Required<Omit<LitAuthContextOptions, 'privateKey'>> = {
  chain: 'ethereum',
  domain: 'haven.video',
  statement: 'Sign this message to decrypt your video with Haven',
  expirationMs: 60 * 60 * 1000, // 1 hour
}

/**
 * Auth context returned from createLitAuthContext.
 * This is a simplified interface that matches the actual return type.
 */
export interface LitAuthContext {
  /** User identifier (wallet address) */
  userId?: string
  /** Authentication data */
  authData?: {
    userId?: string
    expiration?: string
    [key: string]: unknown
  }
  /** Session expiration time */
  expiration?: string
  /** Raw authentication context (implementation detail) */
  [key: string]: unknown
}

/**
 * Create an authentication context for Lit Protocol operations.
 * 
 * This creates a signed authentication context using an EOA (Externally Owned Account)
 * that can be used for decryption operations with Lit Protocol nodes.
 * 
 * @param options - Configuration options for the auth context
 * @returns Promise resolving to the authentication context
 * @throws LitAuthError if client is not initialized or auth context creation fails
 * 
 * @example
 * ```typescript
 * const authContext = await createLitAuthContext({
 *   privateKey: '0x1234567890abcdef...',
 *   chain: 'ethereum',
 * })
 * 
 * // Use authContext for decryption
 * ```
 */
export async function createLitAuthContext(
  options: LitAuthContextOptions
): Promise<LitAuthContext> {
  const {
    privateKey,
    domain = DEFAULT_AUTH_OPTIONS.domain,
    statement = DEFAULT_AUTH_OPTIONS.statement,
    expirationMs = DEFAULT_AUTH_OPTIONS.expirationMs,
  } = options
  
  // Get initialized client and auth manager
  let client: ReturnType<typeof getLitClient>
  let authManager: ReturnType<typeof getAuthManager>
  
  try {
    client = getLitClient()
    authManager = getAuthManager()
  } catch {
    throw new LitAuthError(
      'Lit client not initialized. Call initLitClient() first.',
      'CLIENT_NOT_INITIALIZED'
    )
  }
  
  // Create viem account from private key
  let viemAccount: ReturnType<typeof createViemAccount>
  try {
    viemAccount = createViemAccount(privateKey)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid private key'
    throw new LitAuthError(message, 'INVALID_PRIVATE_KEY')
  }
  
  // Calculate expiration time
  const expiration = new Date(Date.now() + expirationMs).toISOString()
  
  try {
    // Create authentication context using EOA
    // Use type assertion to handle viem version mismatch
    const authContext = await (authManager as ReturnType<typeof createAuthManager>).createEoaAuthContext({
      authConfig: {
        domain,
        statement,
        resources: [
          {
            resource: new LitAccessControlConditionResource('*'),
            ability: 'access-control-condition-decryption',
          },
        ],
        expiration,
      },
      config: {
        account: viemAccount as unknown as Parameters<typeof authManager.createEoaAuthContext>[0]['config']['account'],
      },
      litClient: client,
    })
    
    return authContext as LitAuthContext
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    throw new LitAuthError(
      `Failed to create auth context: ${message}`,
      'AUTH_CONTEXT_FAILED'
    )
  }
}

/**
 * Create authentication context with custom resources.
 * 
 * This allows specifying custom access control resources for more granular
 * permissions during authentication.
 * 
 * @param options - Configuration options
 * @param resources - Custom Lit resources to request access to
 * @returns Promise resolving to the authentication context
 * @throws LitAuthError if creation fails
 * 
 * @example
 * ```typescript
 * const authContext = await createLitAuthContextWithResources(
 *   { privateKey: '0x1234...' },
 *   [
 *     {
 *       resource: new LitAccessControlConditionResource('specific-resource'),
 *       ability: 'access-control-condition-decryption',
 *     },
 *   ]
 * )
 * ```
 */
export async function createLitAuthContextWithResources(
  options: LitAuthContextOptions,
  resources: Array<{
    resource: LitAccessControlConditionResource
    ability: 'pkp-signing' | 'lit-action-execution' | 'access-control-condition-signing' | 'access-control-condition-decryption' | 'lit-payment-delegation'
  }>
): Promise<LitAuthContext> {
  const {
    privateKey,
    domain = DEFAULT_AUTH_OPTIONS.domain,
    statement = DEFAULT_AUTH_OPTIONS.statement,
    expirationMs = DEFAULT_AUTH_OPTIONS.expirationMs,
  } = options
  
  let client: ReturnType<typeof getLitClient>
  let authManager: ReturnType<typeof getAuthManager>
  
  try {
    client = getLitClient()
    authManager = getAuthManager()
  } catch {
    throw new LitAuthError(
      'Lit client not initialized. Call initLitClient() first.',
      'CLIENT_NOT_INITIALIZED'
    )
  }
  
  let viemAccount: ReturnType<typeof createViemAccount>
  try {
    viemAccount = createViemAccount(privateKey)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid private key'
    throw new LitAuthError(message, 'INVALID_PRIVATE_KEY')
  }
  
  const expiration = new Date(Date.now() + expirationMs).toISOString()
  
  try {
    const authContext = await (authManager as ReturnType<typeof createAuthManager>).createEoaAuthContext({
      authConfig: {
        domain,
        statement,
        resources,
        expiration,
      },
      config: {
        account: viemAccount as unknown as Parameters<typeof authManager.createEoaAuthContext>[0]['config']['account'],
      },
      litClient: client,
    })
    
    return authContext as LitAuthContext
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    throw new LitAuthError(
      `Failed to create auth context: ${message}`,
      'AUTH_CONTEXT_FAILED'
    )
  }
}

/**
 * Check if an authentication context is expired.
 * 
 * @param authContext - The authentication context to check
 * @returns True if the context has expired
 */
export function isAuthContextExpired(authContext: LitAuthContext): boolean {
  // Check expiration in the auth context
  const expiration = authContext.expiration || authContext.authData?.expiration
  
  if (!expiration) {
    return false // No expiration set, assume not expired
  }
  
  const expirationDate = new Date(expiration)
  return expirationDate <= new Date()
}

/**
 * Get the wallet address from an authentication context.
 * 
 * @param authContext - The authentication context
 * @returns The wallet address or null if not available
 */
export function getAuthContextAddress(authContext: LitAuthContext): string | null {
  return authContext.userId || authContext.authData?.userId || null
}
