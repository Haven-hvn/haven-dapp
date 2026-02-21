/**
 * Lit Protocol Authentication Context Helper
 * 
 * Provides utilities for creating authentication contexts for Lit Protocol
 * operations using the connected wallet via wagmi/AppKit instead of private keys.
 * 
 * This module uses SIWE (Sign-In with Ethereum) through the user's connected
 * wallet for secure authentication with Lit Protocol nodes.
 * 
 * @module lib/lit-auth
 */

import { getLitClient, getAuthManager } from './lit'
import { LitAccessControlConditionResource } from '@lit-protocol/auth-helpers'
import type { Account, Transport, Chain, WalletClient } from 'viem'
import type { GetWalletClientReturnType } from '@wagmi/core'
import {
  getCachedAuthContext,
  setCachedAuthContext,
} from './lit-session-cache'

/**
 * Error thrown when Lit auth operations fail.
 */
export class LitAuthError extends Error {
  constructor(
    message: string,
    public code: 'CLIENT_NOT_INITIALIZED' | 'AUTH_CONTEXT_FAILED' | 'WALLET_NOT_CONNECTED' | 'SIGNING_FAILED'
  ) {
    super(message)
    this.name = 'LitAuthError'
  }
}

/**
 * Configuration options for creating a Lit authentication context.
 */
export interface LitAuthContextOptions {
  /** The viem account from wagmi/useAccount */
  account?: Account
  
  /** The wallet client transport for signing */
  transport?: Transport
  
  /** The blockchain chain to use for authentication */
  chain: Chain
  
  /** Viem WalletClient from wagmi useWalletClient() (preferred for Lit SDK v8) */
  walletClient?: WalletClient | GetWalletClientReturnType
  
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
const DEFAULT_AUTH_OPTIONS: Required<Omit<LitAuthContextOptions, 'account' | 'transport' | 'chain' | 'walletClient'>> = {
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
 * Extract wallet address from auth context options.
 */
function getAddressFromOptions(options: LitAuthContextOptions): string | null {
  // Try to get address from account
  if (options.account?.address) {
    return options.account.address
  }

  // Try to get address from walletClient
  if (options.walletClient) {
    const wc = options.walletClient as WalletClient
    if (wc.account?.address) {
      return wc.account.address
    }
  }

  return null
}

/**
 * Create an authentication context for Lit Protocol operations using the connected wallet.
 *
 * This creates a signed authentication context using the user's connected wallet
 * (via wagmi/AppKit) that can be used for decryption operations with Lit Protocol nodes.
 *
 * The user's wallet will be prompted to sign a SIWE message to authenticate.
 *
 * This function caches the auth context to avoid repeated wallet signatures within
 * the same session. The cache is keyed by wallet address and expires based on the
 * configured expiration time (default: 1 hour) with a 5-minute safety margin.
 *
 * @param options - Configuration options for the auth context
 * @returns Promise resolving to the authentication context
 * @throws LitAuthError if client is not initialized or auth context creation fails
 *
 * @example
 * ```typescript
 * const { address, connector } = useAccount()
 * const { data: walletClient } = useWalletClient()
 *
 * if (walletClient) {
 *   const authContext = await createLitAuthContext({
 *     account: walletClient.account,
 *     transport: walletClient.transport,
 *     chain: walletClient.chain,
 *   })
 *
 *   // Use authContext for decryption
 * }
 * ```
 */
export async function createLitAuthContext(
  options: LitAuthContextOptions
): Promise<LitAuthContext> {
  const {
    account,
    transport,
    chain,
    walletClient,
    domain = DEFAULT_AUTH_OPTIONS.domain,
    statement = DEFAULT_AUTH_OPTIONS.statement,
    expirationMs = DEFAULT_AUTH_OPTIONS.expirationMs,
  } = options

  // Validate we have either walletClient or (account and transport)
  if (!walletClient && !account) {
    throw new LitAuthError(
      'No wallet client or account provided. Make sure wallet is connected.',
      'WALLET_NOT_CONNECTED'
    )
  }

  // Check cache first - avoids wallet popup if we have a valid session
  const address = getAddressFromOptions(options)
  if (address) {
    const cached = getCachedAuthContext(address)
    if (cached) {
      return cached // No wallet popup!
    }
  }

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

  // Calculate expiration time
  const expiration = new Date(Date.now() + expirationMs).toISOString()

  try {
    // Build the auth config for Lit SDK v8
    // The SDK expects config.account to be Account | WalletClient | GetWalletClientReturnType | PrivateKeyAccount
    const authConfigObj: any = {
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
        // Lit SDK v8 expects `account` to be a WalletClient, Account, or PrivateKeyAccount
        account: walletClient || account,
      },
      litClient: client,
    }

    // Create authentication context using EOA with wallet signing
    // The wallet client will prompt the user to sign the SIWE message
    const authContext = await authManager.createEoaAuthContext(authConfigObj)

    // Cache for reuse (triggers on cache miss)
    if (address) {
      setCachedAuthContext(address, authContext as LitAuthContext, expirationMs)
    }

    return authContext as LitAuthContext
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'

    // Check if user rejected the signing
    if (message.includes('rejected') || message.includes('denied') || message.includes('cancelled')) {
      throw new LitAuthError(
        'User rejected the authentication signature.',
        'SIGNING_FAILED'
      )
    }

    throw new LitAuthError(
      `Failed to create auth context: ${message}`,
      'AUTH_CONTEXT_FAILED'
    )
  }
}

/**
 * Create authentication context with custom resources using the connected wallet.
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
 * const { data: walletClient } = useWalletClient()
 * 
 * if (walletClient) {
 *   const authContext = await createLitAuthContextWithResources(
 *     {
 *       account: walletClient.account,
 *       transport: walletClient.transport,
 *       chain: walletClient.chain,
 *     },
 *     [
 *       {
 *         resource: new LitAccessControlConditionResource('specific-resource'),
 *         ability: 'access-control-condition-decryption',
 *       },
 *     ]
 *   )
 * }
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
    account,
    transport,
    chain,
    domain = DEFAULT_AUTH_OPTIONS.domain,
    statement = DEFAULT_AUTH_OPTIONS.statement,
    expirationMs = DEFAULT_AUTH_OPTIONS.expirationMs,
  } = options
  
  if (!account) {
    throw new LitAuthError(
      'No wallet account provided. Make sure wallet is connected.',
      'WALLET_NOT_CONNECTED'
    )
  }
  
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
  
  const expiration = new Date(Date.now() + expirationMs).toISOString()
  
  try {
    const authContext = await authManager.createEoaAuthContext({
      authConfig: {
        domain,
        statement,
        resources,
        expiration,
      },
      config: {
        account: account as any,
        transport: transport as any,
        chain: chain as any,
      } as any,
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
