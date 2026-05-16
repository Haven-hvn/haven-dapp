/**
 * Haven-AOL Provider Component
 *
 * Provides Haven-AOL configuration context to the React component tree.
 * Haven-AOL Provider. Haven-AOL is stateless (no persistent connection)
 * so this is lightweight — just validates config on mount.
 *
 * @module components/providers/HavenAolProvider
 */

'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { isHavenAolConfigValid, getHavenAolConfig, type HavenAolConfig } from '@/lib/haven-aol'

// ============================================================================
// Context
// ============================================================================

interface HavenAolContextValue {
  /** Whether Haven-AOL configuration is valid and ready */
  isReady: boolean
  /** Configuration error (if invalid) */
  error: string | null
  /** The resolved configuration (null until validated) */
  config: HavenAolConfig | null
}

const HavenAolContext = createContext<HavenAolContextValue>({
  isReady: false,
  error: null,
  config: null,
})

// ============================================================================
// Hook
// ============================================================================

/**
 * Access Haven-AOL context.
 *
 * @returns Haven-AOL readiness state and config
 */
export function useHavenAolContext(): HavenAolContextValue {
  return useContext(HavenAolContext)
}

// ============================================================================
// Provider
// ============================================================================

interface HavenAolProviderProps {
  children: ReactNode
}

/**
 * Haven-AOL Provider Component.
 *
 * Validates configuration on mount and provides readiness state
 * to the component tree. There is no persistent
 * connection to manage — each decrypt operation creates its own
 * anonymous ICP agent.
 */
export function HavenAolProvider({ children }: HavenAolProviderProps): React.ReactElement {
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [config, setConfig] = useState<HavenAolConfig | null>(null)

  useEffect(() => {
    try {
      if (isHavenAolConfigValid()) {
        setConfig(getHavenAolConfig())
        setIsReady(true)
        setError(null)
      } else {
        setError('Haven-AOL configuration incomplete. Check environment variables.')
        setIsReady(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown configuration error')
      setIsReady(false)
    }
  }, [])

  return (
    <HavenAolContext.Provider value={{ isReady, error, config }}>
      {children}
    </HavenAolContext.Provider>
  )
}
