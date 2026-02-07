'use client'

/**
 * Error Overlay Component
 * 
 * Displays video playback errors with:
 * - User-friendly error messages
 * - Context-aware help text based on error type
 * - Retry functionality
 * - Additional guidance for encrypted videos
 * 
 * @module components/player/ErrorOverlay
 */

import { AlertTriangle, RefreshCw } from 'lucide-react'

interface ErrorOverlayProps {
  error: string
  onRetry: () => void
  isEncrypted: boolean
}

export function ErrorOverlay({ error, onRetry, isEncrypted }: ErrorOverlayProps) {
  const getHelpfulMessage = (error: string): string => {
    const lowerError = error.toLowerCase()
    
    if (lowerError.includes('too large') || lowerError.includes('exceeds')) {
      return 'This video is too large to play in the browser. Please use the Haven desktop app for large encrypted videos.'
    }
    if (lowerError.includes('permission') || lowerError.includes('access control') || lowerError.includes('unauthorized')) {
      return 'You do not have permission to decrypt this video. Make sure you\'re using the wallet that owns this video.'
    }
    if (lowerError.includes('network') || lowerError.includes('fetch') || lowerError.includes('download')) {
      return 'Failed to download the video. Please check your connection and try again.'
    }
    if (lowerError.includes('timeout')) {
      return 'The download timed out. The IPFS network may be slow. Please try again.'
    }
    if (lowerError.includes('cancelled')) {
      return 'The operation was cancelled. You can try again.'
    }
    if (lowerError.includes('private key')) {
      return 'Unable to access your decryption key. Please check your wallet connection.'
    }
    if (lowerError.includes('lit') || lowerError.includes('protocol')) {
      return 'There was an issue with the encryption service. Please try again later.'
    }
    if (lowerError.includes('not available') || lowerError.includes('not found')) {
      return 'This video is no longer available or has been removed.'
    }
    
    return error
  }
  
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-20">
      <div className="text-center max-w-md px-6">
        <AlertTriangle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
        
        <h3 className="text-xl font-semibold text-white mb-2">
          Failed to Play Video
        </h3>
        
        <p className="text-white/60 mb-6">
          {getHelpfulMessage(error)}
        </p>
        
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Try Again
        </button>
        
        {isEncrypted && (
          <p className="text-xs text-white/30 mt-4">
            Encrypted videos require your wallet to decrypt them locally.
          </p>
        )}
      </div>
    </div>
  )
}
