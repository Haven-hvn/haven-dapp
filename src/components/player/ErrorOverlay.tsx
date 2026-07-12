'use client'

/**
 * Error Overlay Component
 *
 * Displays structured playback errors (Filecoin retrieval vs wallet/decrypt).
 *
 * @module components/player/ErrorOverlay
 */

import { AlertTriangle, RefreshCw } from 'lucide-react'
import type { PlaybackErrorPresentation } from '@/lib/playback-errors'

interface ErrorOverlayProps {
  presentation: PlaybackErrorPresentation
  onRetry: () => void
  isEncrypted: boolean
}

export function ErrorOverlay({
  presentation,
  onRetry,
  isEncrypted,
}: ErrorOverlayProps) {
  const showEncryptedFooter =
    isEncrypted && presentation.showEncryptedNote

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-20">
      <div className="text-center max-w-md px-6">
        <AlertTriangle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />

        <h3 className="text-xl font-semibold text-white mb-2">
          {presentation.title}
        </h3>

        <p className="text-white/80 mb-3 leading-relaxed">{presentation.message}</p>

        {presentation.hint != null && presentation.hint.length > 0 ? (
          <p className="text-sm text-white/50 mb-6 leading-relaxed">
            {presentation.hint}
          </p>
        ) : (
          <div className="mb-6" />
        )}

        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors touch-manipulation min-h-[44px]"
        >
          <RefreshCw className="w-4 h-4" />
          {presentation.retryLabel ?? 'Try again'}
        </button>

        {presentation.retryHint != null && presentation.retryHint.length > 0 ? (
          <p className="text-xs text-white/45 mt-2 leading-relaxed">
            {presentation.retryHint}
          </p>
        ) : null}

        {showEncryptedFooter && (
          <p className="text-xs text-white/40 mt-4 leading-relaxed">
            Encrypted videos are decrypted in your browser after you sign with
            the owning wallet.
          </p>
        )}
      </div>
    </div>
  )
}
