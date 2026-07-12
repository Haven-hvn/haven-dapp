'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

/**
 * Configuration for the Token-Gated Events embed widget.
 */
interface TokenGatedEventsEmbedProps {
  /** Token contract address to filter events */
  filterContract: string
  /** Chain to filter events (e.g., 'ethereum') */
  filterChain?: string
  /** Theme override ('light' | 'dark') */
  theme?: 'light' | 'dark'
  /** Whether to use compact card style */
  compact?: boolean
  /**
   * Public mode — show all events regardless of whether the viewer holds the token.
   * Defaults to true for landing page use cases.
   */
  publicMode?: boolean
  /** Base URL of the events platform */
  baseUrl?: string
  /** Additional CSS class names */
  className?: string
}

/**
 * Token-Gated Events Embed Component
 * 
 * Embeds the Token-Gated Events Platform viewer widget via iframe.
 * Communicates with the embedded widget via PostMessage protocol.
 * 
 * The widget is hosted at tokengatedevents.orbiter.website and supports:
 * - filterContract: Show only events gated by this token
 * - filterChain: Show only events on this chain
 * - theme: Light or dark theme
 * - compact: Minimal card style
 * 
 * PostMessage events received from the widget:
 * - ready: Widget has loaded
 * - event-selected: User clicked an event
 * - room-joined / room-left: User joined/left a meeting
 * - resize: Widget content height changed (for auto-resize)
 */
export function TokenGatedEventsEmbed({
  filterContract,
  filterChain = 'ethereum',
  theme = 'dark',
  compact = true,
  publicMode = true,
  baseUrl = 'https://tokengatedevents.orbiter.website',
  className = '',
}: TokenGatedEventsEmbedProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const [iframeHeight, setIframeHeight] = useState<number | null>(null)

  // Build the embed URL with query parameters
  const embedUrl = new URL('/embed/viewer', baseUrl)
  embedUrl.searchParams.set('filterContract', filterContract)
  if (filterChain) embedUrl.searchParams.set('filterChain', filterChain)
  if (theme) embedUrl.searchParams.set('theme', theme)
  if (compact) embedUrl.searchParams.set('compact', 'true')
  if (publicMode) embedUrl.searchParams.set('publicMode', 'true')

  // Listen for PostMessage events from the embedded widget
  const handleMessage = useCallback((event: MessageEvent) => {
    // Only accept messages from the events platform
    if (!event.origin.includes('tokengatedevents.orbiter.website') && 
        !event.origin.includes('localhost')) {
      return
    }

    // Verify message source
    if (event.data?.source !== 'token-gated-events') return

    switch (event.data.type) {
      case 'ready':
        setIsLoaded(true)
        break
      case 'resize':
        if (event.data.payload?.height) {
          setIframeHeight(event.data.payload.height)
        }
        break
      case 'event-selected':
        // Could be used to sync state with parent app
        break
      case 'room-joined':
      case 'room-left':
        // Could trigger UI changes in the parent app
        break
    }
  }, [])

  useEffect(() => {
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [handleMessage])

  return (
    <div className={`relative ${className}`}>
      {/* Loading skeleton */}
      {!isLoaded && (
        <div className="absolute inset-0 flex flex-col gap-3 p-2 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 rounded-lg bg-white/[0.04] border border-white/[0.06]"
            />
          ))}
        </div>
      )}

      <iframe
        ref={iframeRef}
        src={embedUrl.toString()}
        title="Token-Gated Events"
        className="w-full border-0 rounded-lg transition-opacity duration-300"
        style={{
          opacity: isLoaded ? 1 : 0,
          height: iframeHeight ? `${iframeHeight}px` : '500px',
          minHeight: '300px',
        }}
        allow="camera; microphone; clipboard-write; display-capture"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals"
      />
    </div>
  )
}