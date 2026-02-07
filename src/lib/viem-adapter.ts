/**
 * Viem Adapter for Lit Protocol
 * 
 * Provides account creation from private keys using viem,
 * compatible with Lit Protocol's authentication requirements.
 * 
 * @module lib/viem-adapter
 */

import { privateKeyToAccount } from 'viem/accounts'
import type { Account } from 'viem'

/**
 * Error thrown when viem adapter operations fail.
 */
export class ViemAdapterError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ViemAdapterError'
  }
}

/**
 * Create a viem account from a private key.
 * 
 * Normalizes the private key to ensure it has the required '0x' prefix
 * and validates the format before creating the account.
 * 
 * @param privateKey - The private key (with or without '0x' prefix)
 * @returns A viem Account instance
 * @throws ViemAdapterError if the private key is invalid
 * 
 * @example
 * ```typescript
 * // With 0x prefix
 * const account1 = createViemAccount('0x1234567890abcdef...')
 * 
 * // Without 0x prefix
 * const account2 = createViemAccount('1234567890abcdef...')
 * 
 * console.log(account.address) // '0x...'
 * ```
 */
export function createViemAccount(privateKey: string): Account {
  if (!privateKey || typeof privateKey !== 'string') {
    throw new ViemAdapterError('Private key must be a non-empty string')
  }
  
  // Normalize private key to ensure 0x prefix
  const normalizedKey = privateKey.startsWith('0x') 
    ? privateKey 
    : `0x${privateKey}`
  
  // Validate hex format
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalizedKey)) {
    throw new ViemAdapterError(
      'Invalid private key format. Expected 64 hexadecimal characters with optional 0x prefix.'
    )
  }
  
  try {
    return privateKeyToAccount(normalizedKey as `0x${string}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    throw new ViemAdapterError(`Failed to create account: ${message}`)
  }
}

/**
 * Validate a private key format without creating an account.
 * 
 * @param privateKey - The private key to validate
 * @returns True if the private key format is valid
 * 
 * @example
 * ```typescript
 * const isValid = validatePrivateKeyFormat('0x1234...')
 * if (isValid) {
 *   // Proceed with account creation
 * }
 * ```
 */
export function validatePrivateKeyFormat(privateKey: string): boolean {
  if (!privateKey || typeof privateKey !== 'string') {
    return false
  }
  
  const normalizedKey = privateKey.startsWith('0x') 
    ? privateKey 
    : `0x${privateKey}`
  
  return /^0x[0-9a-fA-F]{64}$/.test(normalizedKey)
}

/**
 * Get the Ethereum address from a private key without storing the account.
 * 
 * @param privateKey - The private key to derive address from
 * @returns The Ethereum address
 * @throws ViemAdapterError if the private key is invalid
 * 
 * @example
 * ```typescript
 * const address = getAddressFromPrivateKey('0x1234...')
 * console.log(address) // '0x...'
 * ```
 */
export function getAddressFromPrivateKey(privateKey: string): string {
  const account = createViemAccount(privateKey)
  return account.address
}
