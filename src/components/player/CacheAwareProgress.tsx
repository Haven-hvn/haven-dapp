 'use client'

/**
 * Cache-Aware Progress Component
 * 
 * Displays loading progress for video playback with awareness of:
 * - Cache hit vs cache miss scenarios
 * - Different loading stages (fetching, authenticating, decrypting, caching)
 * - Progress bar with stage-specific messaging
 * 
 * Replaces DecryptionProgress with support for non-encrypted videos
 * and cache-first loading stages.
 * 
 * @module components/player/CacheAwareProgress
 */

import { Loader2, Download, Shield, Unlock, HardDrive, Search, Key } from 'lucide-react'
import type { LoadingStage } from '@/hooks/useVideoCache'

interface CacheAwareProgressProps {
  /** Current loading stage */
  stage: LoadingStage
  /** Progress percentage (0-100) */
  progress: number
  /** Whether the video was already cached */
  isCached?: boolean
}

/**
 * Stage configuration with icon, message, and progress bar behavior
 */
const STAGE_CONFIG: Record<LoadingStage, {
  icon: React.ComponentType<{ className?: string }>
  message: string
  showProgress: boolean
  isIndeterminate: boolean
  iconClass: string
}> = {
  'checking-cache': {
    icon: Search,
    message: 'Checking cache...',
    showProgress: true,
    isIndeterminate: true,
    iconClass: 'text-blue-400',
  },
  'decrypting-cid': {
    icon: Key,
    message: 'Please approve in your wallet...',
    showProgress: true,
    isIndeterminate: true,
    iconClass: 'text-purple-400',
  },
  'fetching': {
    icon: Download,
    message: 'Downloading encrypted video...',
    showProgress: true,
    isIndeterminate: false,
    iconClass: 'text-purple-400',
  },
  'authenticating': {
    icon: Shield,
    message: 'Please approve in your wallet...',
    showProgress: true,
    isIndeterminate: true,
    iconClass: 'text-purple-400',
  },
  'decrypting': {
    icon: Unlock,
    message: 'Decrypting video...',
    showProgress: true,
    isIndeterminate: false,
    iconClass: 'text-purple-400',
  },
  'caching': {
    icon: HardDrive,
    message: 'Saving for instant replay...',
    showProgress: true,
    isIndeterminate: true,
    iconClass: 'text-blue-400',
  },
  'ready': {
    icon: Loader2,
    message: '',
    showProgress: false,
    isIndeterminate: false,
    iconClass: 'text-green-400',
  },
  'error': {
    icon: Loader2,
    message: '',
    showProgress: false,
    isIndeterminate: false,
    iconClass: 'text-red-400',
  },
}

/**
 * Get background color class for icon container based on stage
 */
function getIconBgClass(stage: LoadingStage): string {
  switch (stage) {
    case 'checking-cache':
    case 'caching':
      return 'bg-blue-500/20'
    case 'decrypting-cid':
    case 'fetching':
    case 'authenticating':
    case 'decrypting':
      return 'bg-purple-500/20'
    case 'ready':
      return 'bg-green-500/20'
    case 'error':
      return 'bg-red-500/20'
    default:
      return 'bg-purple-500/20'
  }
}

export function CacheAwareProgress({ 
  stage, 
  progress, 
  isCached 
}: CacheAwareProgressProps) {
  const config = STAGE_CONFIG[stage]
  
  // Don't show for ready/error stages (ready = video plays, error = handled by ErrorOverlay)
  if (!config || !config.showProgress) return null
  
  const Icon = config.icon
  const iconBgClass = getIconBgClass(stage)
  const isSpinner = stage === 'checking-cache' || stage === 'authenticating' || stage === 'decrypting-cid'

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm z-10">
      <div className="flex flex-col items-center text-center text-white max-w-md px-6">
        {/* Icon with animated background */}
        <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full ${iconBgClass} mb-4`}>
          <div className={isSpinner ? 'animate-pulse' : ''}>
            <Icon className={`w-8 h-8 ${config.iconClass} ${isSpinner ? 'animate-spin' : ''}`} />
          </div>
        </div>
        
        {/* Stage message */}
        <p className="text-base text-white/90 mb-4 font-medium">{config.message}</p>
        
        {/* Progress bar */}
        <div className="w-64 h-1.5 bg-white/10 rounded-full overflow-hidden">
          {config.isIndeterminate ? (
            <div className="h-full bg-purple-500 rounded-full animate-[loading_1.5s_ease-in-out_infinite]" 
                 style={{ 
                   width: '33%',
                   animation: 'indeterminate 1.5s ease-in-out infinite'
                 }} />
          ) : (
            <div 
              className="h-full bg-purple-500 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          )}
        </div>
        
        {/* Progress percentage for determinate stages */}
        {!config.isIndeterminate && progress > 0 && (
          <p className="text-xs text-white/40 mt-2">{Math.round(progress)}%</p>
        )}
        
        {/* Special message for stages that require wallet signature */}
        {(stage === 'authenticating' || stage === 'decrypting-cid') && (
          <div className="mt-4 text-center">
            <p className="text-sm text-white/70 font-medium animate-pulse">
              Check your wallet for a signature request
            </p>
            <p className="text-xs text-white/30 mt-2">
              <a 
                href="#" 
                className="underline hover:text-white/50 transition-colors"
                onClick={(e) => {
                  e.preventDefault()
                  // Could open a modal explaining SIWE
                  alert('Sign-In with Ethereum (SIWE) allows you to prove ownership of your wallet address. This signature does not cost any gas and is used only for authentication.')
                }}
              >
                What&apos;s this?
              </a>
            </p>
          </div>
        )}
        
        {/* Privacy note for decrypting stage */}
        {stage === 'decrypting' && (
          <p className="text-xs text-white/30 mt-4">
            Your private key never leaves your browser
          </p>
        )}
      </div>
      
      <style jsx>{`
        @keyframes indeterminate {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(100%); }
          100% { transform: translateX(300%); }
        }
      `}</style>
    </div>
  )
}
