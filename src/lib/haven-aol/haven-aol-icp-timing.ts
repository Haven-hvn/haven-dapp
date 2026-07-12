/**
 * Console timing for Haven-AOL ICP canister calls (post wallet sign).
 *
 * @module lib/haven-aol/haven-aol-icp-timing
 */

const LOG_PREFIX = '[HavenAOL]'

export interface HavenAolIcpTimingMark {
  /** When the wallet EIP-712 sign completed (`performance.now()`). */
  postSignStartMs: number
}

export function markPostWalletSign(): HavenAolIcpTimingMark {
  return { postSignStartMs: performance.now() }
}

/**
 * Log duration of a single `requestDecryptionKey` HTTP/canister round-trip.
 */
export function logRequestDecryptionKeyDuration(
  mark: HavenAolIcpTimingMark,
  durationMs: number,
  attempt: number
): void {
  const sinceSignMs = performance.now() - mark.postSignStartMs
  console.info(
    `${LOG_PREFIX} requestDecryptionKey round-trip: ${durationMs.toFixed(0)}ms ` +
      `(attempt ${attempt + 1}, ${sinceSignMs.toFixed(0)}ms since wallet sign)`
  )
}

/**
 * Log total time from wallet sign to successful ICP key payload (`result.ok`).
 */
export function logPostSignToIcpKeySuccess(
  mark: HavenAolIcpTimingMark,
  attempt: number
): void {
  const totalMs = performance.now() - mark.postSignStartMs
  console.info(
    `${LOG_PREFIX} ICP decryption key received: ${totalMs.toFixed(0)}ms since wallet sign ` +
      `(attempt ${attempt + 1})`
  )
}

/**
 * Log optional follow-up ICP call (verification key fetch).
 */
export function logFetchVerificationKeyDuration(durationMs: number): void {
  console.info(
    `${LOG_PREFIX} fetchVerificationKey round-trip: ${durationMs.toFixed(0)}ms`
  )
}
