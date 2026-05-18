/**
 * Haven-AOL Error Handling
 *
 * Maps HavenAolError gate errors to user-friendly UI strings
 * and provides error classification for programmatic handling.
 *
 * @module lib/haven-aol/haven-aol-errors
 */

// ============================================================================
// Error Codes
// ============================================================================

/**
 * Application-level error codes for Haven-AOL operations.
 */
export type HavenAolErrorCode =
  | 'INSUFFICIENT_BALANCE'
  | 'INVALID_SIGNATURE'
  | 'NONCE_ALREADY_USED'
  | 'INVALID_ADDRESS'
  | 'INVALID_THRESHOLD'
  | 'EVM_RPC_ERROR'
  | 'VETKD_ERROR'
  | 'CANISTER_UNREACHABLE'
  | 'METADATA_INVALID'
  | 'DERIVATION_CID_MISSING'
  | 'WALLET_NOT_CONNECTED'
  | 'SIGNING_REJECTED'
  | 'DECRYPTION_FAILED'
  | 'CANCELLED'
  | 'UNKNOWN'

// ============================================================================
// Error Class
// ============================================================================

/**
 * Typed error for Haven-AOL decryption operations.
 */
export class HavenAolDecryptError extends Error {
  public readonly code: HavenAolErrorCode

  constructor(message: string, code: HavenAolErrorCode) {
    super(message)
    this.name = 'HavenAolDecryptError'
    this.code = code
  }
}

// ============================================================================
// Error Mapping
// ============================================================================

/**
 * Map a gate error object from the canister to a user-friendly error.
 *
 * @param gateError - The error object from HavenAolError.gateError
 * @returns A HavenAolDecryptError with appropriate code and message
 */
export function mapGateError(gateError: unknown): HavenAolDecryptError {
  if (!gateError || typeof gateError !== 'object') {
    return new HavenAolDecryptError(
      'An unknown error occurred during decryption.',
      'UNKNOWN'
    )
  }

  const err = gateError as Record<string, unknown>

  if ('InsufficientBalance' in err) {
    const details = err.InsufficientBalance as { required?: bigint; actual?: bigint }
    const required = details?.required?.toString() || '?'
    const actual = details?.actual?.toString() || '0'
    return new HavenAolDecryptError(
      `Insufficient token balance. Required: ${required}, your balance: ${actual}. ` +
      'Make sure you hold the required tokens on the correct chain.',
      'INSUFFICIENT_BALANCE'
    )
  }

  if ('InvalidSignature' in err) {
    return new HavenAolDecryptError(
      'Invalid signature. Please try signing again with your wallet.',
      'INVALID_SIGNATURE'
    )
  }

  if ('NonceAlreadyUsed' in err) {
    return new HavenAolDecryptError(
      'Decrypt session is out of sync with the network. Try playing the video again.',
      'NONCE_ALREADY_USED'
    )
  }

  if ('InvalidAddress' in err) {
    return new HavenAolDecryptError(
      `Invalid address: ${err.InvalidAddress}`,
      'INVALID_ADDRESS'
    )
  }

  if ('InvalidThreshold' in err) {
    return new HavenAolDecryptError(
      'Invalid threshold in gate configuration.',
      'INVALID_THRESHOLD'
    )
  }

  if ('EvmRpcError' in err) {
    return new HavenAolDecryptError(
      `EVM RPC error while verifying balance: ${err.EvmRpcError}. Please try again.`,
      'EVM_RPC_ERROR'
    )
  }

  if ('VetKDError' in err) {
    return new HavenAolDecryptError(
      `Key derivation error: ${err.VetKDError}. Please try again.`,
      'VETKD_ERROR'
    )
  }

  return new HavenAolDecryptError(
    `Gate error: ${JSON.stringify(gateError)}`,
    'UNKNOWN'
  )
}

/**
 * True when the wallet refused an EIP-712 signature (not Synapse/provider failures).
 */
export function isWalletSignatureRejection(error: Error): boolean {
  const msg = error.message
  const lower = msg.toLowerCase()

  if (
    lower.includes('synapse') ||
    lower.includes('storagemanager') ||
    lower.includes('provider retrieval') ||
    lower.includes('promises rejected') ||
    lower.includes('all provider retrieval')
  ) {
    return false
  }

  return (
    lower.includes('user rejected') ||
    lower.includes('user denied') ||
    lower.includes('rejected the request') ||
    lower.includes('request rejected') ||
    lower.includes('action_rejected') ||
    lower.includes('4001') ||
    (error.name === 'UserRejectedRequestError')
  )
}

// ============================================================================
// User-Friendly Messages
// ============================================================================

/**
 * Get a user-friendly error message for any decryption error.
 *
 * @param error - The error that occurred
 * @returns Human-readable error message suitable for UI display
 */
export function getHavenAolErrorMessage(error: unknown): string {
  if (error instanceof HavenAolDecryptError) {
    return error.message
  }

  if (error instanceof Error) {
    const msg = error.message

    // Haven-AOL SDK error
    if (error.name === 'HavenAolError') {
      const gateError = (error as { gateError?: unknown }).gateError
      if (gateError) {
        return mapGateError(gateError).message
      }
    }

    // Wallet rejection (avoid matching Synapse "promises rejected" / StorageManager errors)
    if (isWalletSignatureRejection(error)) {
      return 'Signature request was rejected. Please approve the signature to decrypt the video.'
    }

    if (msg.includes('Loading cancelled') || msg.toLowerCase().includes('cancelled')) {
      return 'Loading was cancelled.'
    }

    // Network errors
    if (msg.includes('fetch') || msg.includes('network') || msg.includes('timeout')) {
      return 'Network error while contacting the decryption service. Please check your connection and try again.'
    }

    // Memory errors
    if (msg.includes('out of memory') || msg.includes('allocation failed')) {
      return 'Video is too large to decrypt in the browser. Please try a different device.'
    }

    // Crypto errors
    if (msg.includes('AES decryption failed') || msg.includes('crypto')) {
      return 'Decryption failed. The file may be corrupted or the wrong key was used.'
    }

    return msg
  }

  return 'An unknown error occurred during decryption.'
}

/**
 * Determine if an error is retryable.
 *
 * @param error - The error to check
 * @returns True if the operation should be retried
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof HavenAolDecryptError) {
    return [
      'NONCE_ALREADY_USED',
      'EVM_RPC_ERROR',
      'VETKD_ERROR',
      'CANISTER_UNREACHABLE',
    ].includes(error.code)
  }

  if (error instanceof Error) {
    return (
      error.message.includes('fetch') ||
      error.message.includes('network') ||
      error.message.includes('timeout')
    )
  }

  return false
}
