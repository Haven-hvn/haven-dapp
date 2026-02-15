/**
 * Lit Protocol Provider Component
 * 
 * Provides Lit Protocol client context to the React component tree,
 * enabling automatic initialization and state sharing across components.
 * 
 * @module components/providers/LitProvider
 */

'use client'

import { createContext, useContext, useEffect, ReactNode, useState } from 'react'
import { useLit, useLitAutoInit, type UseLitReturn } from '@/hooks/useLit'

/**
 * Context value type for Lit Protocol.
 */
interface LitContextValue extends UseLitReturn {
  /** Whether auto-initialization is enabled */
  autoInit: boolean
}

/**
 * React context for Lit Protocol state.
 */
const LitContext = createContext<LitContextValue | null>(null)

/**
 * Hook to access the Lit Protocol context.
 * 
 * @returns The Lit context value
 * @throws Error if used outside of LitProvider
 * 
 * @example
 * ```typescript
 * function MyComponent() {
 *   const { isInitialized, error } = useLitContext()
 *   
 *   if (!isInitialized) return <Loading />
 *   if (error) return <Error message={error.message} />
 *   
 *   return <div>Lit is ready!</div>
 * }
 * ```
 */
export function useLitContext(): LitContextValue {
  const context = useContext(LitContext)
  if (!context) {
    throw new Error('useLitContext must be used within LitProvider')
  }
  return context
}

/**
 * Props for the LitProvider component.
 */
interface LitProviderProps {
  /** Child components */
  children: ReactNode
  
  /** Whether to auto-initialize Lit on mount (default: false) */
  autoInit?: boolean
  
  /** Optional callback when initialization succeeds */
  onInitSuccess?: () => void
  
  /** Optional callback when initialization fails */
  onInitError?: (error: Error) => void
}

/**
 * Lit Protocol Provider Component.
 * 
 * Wraps children with Lit Protocol context, providing initialization
 * state and control functions to the component tree.
 * 
 * @param props - Component props
 * @returns Provider component
 * 
 * @example
 * ```tsx
 * // Basic usage (manual initialization)
 * <LitProvider>
 *   <App />
 * </LitProvider>
 * 
 * // Auto-initialize on mount
 * <LitProvider autoInit>
 *   <App />
 * </LitProvider>
 * 
 * // With callbacks
 * <LitProvider 
 *   autoInit
 *   onInitSuccess={() => console.log('Lit ready!')}
 *   onInitError={(err) => console.error('Lit failed:', err)}
 * >
 *   <App />
 * </LitProvider>
 * ```
 */
export function LitProvider({ 
  children, 
  autoInit = false,
  onInitSuccess,
  onInitError,
}: LitProviderProps): React.ReactElement {
  const lit = useLit()
  const [hasAttemptedInit, setHasAttemptedInit] = useState(false)
  
  // Auto-initialize effect
  useEffect(() => {
    if (autoInit && !lit.isInitialized && !lit.isInitializing && !hasAttemptedInit) {
      setHasAttemptedInit(true)
      lit.initialize().then(() => {
        if (onInitSuccess) {
          onInitSuccess()
        }
      }).catch((error) => {
        if (onInitError) {
          onInitError(error instanceof Error ? error : new Error(String(error)))
        }
      })
    }
  }, [autoInit, lit, hasAttemptedInit, onInitSuccess, onInitError])
  
  // Reset hasAttemptedInit if autoInit is toggled off then on
  useEffect(() => {
    if (!autoInit) {
      setHasAttemptedInit(false)
    }
  }, [autoInit])
  
  const contextValue: LitContextValue = {
    ...lit,
    autoInit,
  }
  
  return (
    <LitContext.Provider value={contextValue}>
      {children}
    </LitContext.Provider>
  )
}

/**
 * Props for the LitRequired component.
 */
interface LitRequiredProps {
  /** Child components to render when Lit is ready */
  children: ReactNode
  
  /** Component to show while initializing */
  loadingComponent?: ReactNode
  
  /** Component to show on error */
  errorComponent?: ReactNode | ((error: Error, retry: () => void) => ReactNode)
  
  /** Whether to auto-initialize (default: true) */
  autoInit?: boolean
}

/**
 * Component that requires Lit Protocol to be initialized.
 * 
 * Renders children only when Lit is initialized, showing loading
 * and error states as appropriate.
 * 
 * @param props - Component props
 * @returns Component that conditionally renders children
 * 
 * @example
 * ```tsx
 * <LitRequired
 *   loadingComponent={<LoadingSpinner />}
 *   errorComponent={(error, retry) => (
 *     <ErrorDisplay message={error.message} onRetry={retry} />
 *   )}
 * >
 *   <VideoPlayer />
 * </LitRequired>
 * ```
 */
export function LitRequired({
  children,
  loadingComponent,
  errorComponent,
  autoInit = true,
}: LitRequiredProps): React.ReactElement {
  const { isInitialized, isInitializing, error, reinitialize } = useLitAutoInit(autoInit)
  
  // Show loading state
  if (isInitializing || (!isInitialized && !error)) {
    return <>{loadingComponent || null}</>
  }
  
  // Show error state
  if (error) {
    if (typeof errorComponent === 'function') {
      return <>{errorComponent(error, reinitialize)}</>
    }
    return <>{errorComponent || null}</>
  }
  
  // Render children when initialized
  return <>{children}</>
}
