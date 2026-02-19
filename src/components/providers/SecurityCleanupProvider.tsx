'use client'

import { useSecurityCleanup } from '@/hooks/useSecurityCleanup'

/**
 * Security Cleanup Provider
 *
 * Wraps the application to enable automatic security cleanup on wallet
 * events (disconnect, account change, chain change).
 *
 * This provider uses the useSecurityCleanup hook to detect changes via
 * wagmi and triggers appropriate cleanup of cached sensitive data:
 * - Lit session cache
 * - AES key cache
 * - OPFS staging files
 * - Video cache (configurable)
 *
 * Place this provider inside the Web3/Auth provider hierarchy but outside
 * components that use cached data.
 *
 * @example
 * ```tsx
 * // In layout.tsx or app wrapper
 * <ThemeProvider>
 *   <ContextProvider>
 *     <SecurityCleanupProvider>
 *       <AuthProvider>
 *         {children}
 *       </AuthProvider>
 *     </SecurityCleanupProvider>
 *   </ContextProvider>
 * </ThemeProvider>
 * ```
 */
export function SecurityCleanupProvider({
  children,
}: {
  children: React.ReactNode
}) {
  useSecurityCleanup()
  return <>{children}</>
}
