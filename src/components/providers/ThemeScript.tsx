'use client'

/**
 * Theme Script Component
 * 
 * Injects a small script into the head to prevent flash of wrong theme.
 * This runs before React hydration to set the correct theme class
 * based on localStorage or system preference.
 * 
 * @module components/providers/ThemeScript
 */

import { useEffect } from 'react'

export function ThemeScript() {
  useEffect(() => {
    // This effect ensures we add the no-transitions class on initial load
    // to prevent transition animations during theme initialization
    const html = document.documentElement
    
    // Add class to disable transitions during theme initialization
    html.classList.add('no-transitions')
    
    // Remove after a short delay to re-enable transitions
    const timer = setTimeout(() => {
      html.classList.remove('no-transitions')
    }, 100)
    
    return () => clearTimeout(timer)
  }, [])
  
  return null
}
