'use client'

/**
 * Decryption Progress Component
 * 
 * Displays the progress of encrypted video decryption with:
 * - Status icons for different stages
 * - Progress bar with download/decryption percentage
 * - User-friendly status messages
 * - Privacy/security notes
 * 
 * @module components/player/DecryptionProgress
 */

import { Loader2, Lock, Download, Key, FileVideo } from 'lucide-react'
import type { DecryptionStatus } from '@/hooks/useVideoDecryption'

interface DecryptionProgressProps {
  status: DecryptionStatus
  progress: string
  downloadProgress: { downloaded: number; total: number; percent: number }
}

export function DecryptionProgress({ 
  status, 
  progress,
  downloadProgress 
}: DecryptionProgressProps) {
  const getStatusIcon = () => {
    switch (status) {
      case 'checking':
        return <Loader2 className="w-8 h-8 animate-spin" />
      case 'fetching':
        return <Download className="w-8 h-8" />
      case 'authenticating':
        return <Lock className="w-8 h-8" />
      case 'decrypting-key':
        return <Key className="w-8 h-8" />
      case 'decrypting-file':
        return <FileVideo className="w-8 h-8" />
      default:
        return <Lock className="w-8 h-8" />
    }
  }
  
  const downloadPercent = downloadProgress.total > 0
    ? Math.round((downloadProgress.downloaded / downloadProgress.total) * 100)
    : 0
  
  // Calculate progress percentage based on status
  const getProgressPercent = () => {
    switch (status) {
      case 'checking':
        return 10
      case 'fetching':
        return 25 + (downloadPercent * 0.25) // 25-50%
      case 'authenticating':
        return 55
      case 'decrypting-key':
        return 70
      case 'decrypting-file':
        return 85
      case 'complete':
        return 100
      default:
        return 0
    }
  }
  
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
      <div className="text-center text-white max-w-md px-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-purple-500/20 text-purple-400 mb-4">
          {getStatusIcon()}
        </div>
        
        <h3 className="text-lg font-semibold mb-2">Encrypted Video</h3>
        <p className="text-white/60 mb-4">{progress || 'Processing...'}</p>
        
        {/* Progress bar */}
        <div className="w-64 h-2 bg-white/20 rounded-full overflow-hidden mx-auto">
          <div 
            className="h-full bg-purple-500 transition-all duration-300"
            style={{ width: `${getProgressPercent()}%` }}
          />
        </div>
        
        {status === 'fetching' && downloadProgress.total > 0 && (
          <p className="text-sm text-white/40 mt-2">
            Downloading: {downloadPercent}%
          </p>
        )}
        
        <p className="text-xs text-white/30 mt-4">
          Your private key never leaves your browser
        </p>
      </div>
    </div>
  )
}
