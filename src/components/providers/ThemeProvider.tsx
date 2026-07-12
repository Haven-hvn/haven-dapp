'use client'

/**
 * Theme Provider Component
 * 
 * Wraps NextThemesProvider to enable dark/light mode switching.
 * Integrates with Tailwind CSS dark mode via the 'class' attribute.
 * 
 * @module components/providers/ThemeProvider
 */

import { ThemeProvider as NextThemesProvider } from 'next-themes'
import { type ReactNode } from 'react'

interface ThemeProviderProps {
  children: ReactNode
  defaultTheme?: string
  enableSystem?: boolean
}

export function ThemeProvider({ 
  children,
  defaultTheme = 'dark',
  enableSystem = true,
}: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme={defaultTheme}
      enableSystem={enableSystem}
      disableTransitionOnChange={false}
    >
      {children}
    </NextThemesProvider>
  )
}
