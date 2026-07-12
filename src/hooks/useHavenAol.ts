/**
 * React Hook for Haven-AOL
 *
 * Provides a React hook for Haven-AOL readiness state.
 * Haven-AOL readiness hook. Haven-AOL doesn't require persistent
 * initialization — this hook just validates config availability.
 *
 * @module hooks/useHavenAol
 */

'use client'

import { useHavenAolContext } from '@/components/providers/HavenAolProvider'

/**
 * Return type for the useHavenAol hook.
 */
export interface UseHavenAolReturn {
  /** Whether Haven-AOL is configured and ready */
  isReady: boolean
  /** Configuration error if any */
  error: string | null
}

/**
 * React hook for Haven-AOL readiness.
 *
 * Haven-AOL doesn't require initialization
 * (no persistent connection). This hook provides config validation state.
 *
 * @returns Object containing readiness state
 *
 * @example
 * ```typescript
 * function VideoPlayer() {
 *   const { isReady, error } = useHavenAol()
 *
 *   if (error) return <Error message={error} />
 *   if (!isReady) return <Loading />
 *
 *   return <VideoStream />
 * }
 * ```
 */
export function useHavenAol(): UseHavenAolReturn {
  const { isReady, error } = useHavenAolContext()
  return { isReady, error }
}
