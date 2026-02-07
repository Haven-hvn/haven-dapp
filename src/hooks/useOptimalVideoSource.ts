/**
 * Optimal Video Source Hook
 * 
 * React hook that selects the best video source based on browser codec support.
 * Detects AV1, H.264, VP9 availability and chooses the optimal variant for
 * the user's device, with fallback chain support.
 * 
 * @module hooks/useOptimalVideoSource
 */

'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import type { Video, CodecVariant } from '@/types'
import type { CodecSupport, VideoCodec } from '@/lib/mediaCapabilities'
import { detectCodecSupport } from '@/lib/mediaCapabilities'

// ============================================================================
// Types
// ============================================================================

/**
 * Video source information with codec details.
 */
export interface VideoSource {
  /** URL to the video file */
  url: string
  /** Codec used for this source */
  codec: VideoCodec
  /** Quality score (0-100, higher is better) */
  quality: number
  /** Bitrate in kbps (if known) */
  bitrate?: number
  /** Resolution (if known) */
  resolution?: {
    width: number
    height: number
  }
  /** File size in bytes (if known) */
  fileSize?: number
}

/**
 * Options for the useOptimalVideoSource hook.
 */
export interface UseOptimalVideoSourceOptions {
  /** Video entity to select source for */
  video: Video | null | undefined
  /** Prefer hardware-accelerated codecs */
  preferHardware?: boolean
  /** Maximum quality to allow */
  maxQuality?: '4k' | '1080p' | '720p' | '480p'
  /** Whether to enable the hook */
  enabled?: boolean
}

/**
 * Return type for the useOptimalVideoSource hook.
 */
export interface UseOptimalVideoSourceReturn {
  /** Selected optimal video source */
  source: VideoSource | null
  /** Codec support information */
  codecSupport: CodecSupport | null
  /** Whether detection is in progress */
  isLoading: boolean
  /** Error if detection failed */
  error: Error | null
  /** Ordered list of fallback sources */
  fallbackChain: VideoSource[]
  /** Current source index in fallback chain */
  currentSourceIndex: number
  /** Move to next fallback source */
  tryNextSource: () => boolean
  /** Retry detection */
  retry: () => void
  /** Whether software decoding is being used */
  isSoftwareDecode: boolean
}

// ============================================================================
// Constants
// ============================================================================

/** Default quality scores by codec (AV1 is most efficient) */
const CODEC_QUALITY_SCORES: Record<VideoCodec, number> = {
  av1: 100,
  vp9: 85,
  h264: 75,
  hevc: 90,
  auto: 70,
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build IPFS URL for a CID.
 * 
 * @param cid - IPFS CID
 * @returns Full URL to the content
 */
function buildIpfsUrlInternal(cid?: string): string {
  if (!cid) return ''
  const gateway = process.env.NEXT_PUBLIC_IPFS_GATEWAY || 'https://gateway.lighthouse.storage/ipfs/'
  return `${gateway}${cid}`
}

/**
 * Select the optimal video source based on codec support.
 * 
 * @param video - Video entity with codec variants
 * @param support - Detected codec support
 * @param preferHardware - Whether to prefer hardware acceleration
 * @returns Selected video source
 */
function selectOptimalSource(
  video: Video,
  support: CodecSupport,
  preferHardware: boolean
): VideoSource {
  const variants = video.codecVariants || []
  
  // Priority: AV1 (hardware) > AV1 (software) > HEVC > VP9 > H.264
  
  // Prefer AV1 with hardware acceleration
  if (support.av1 && support.av1Hardware && preferHardware) {
    const av1Variant = variants.find(v => v.codec === 'av1')
    if (av1Variant) {
      return codecVariantToSource(av1Variant)
    }
  }
  
  // AV1 software decode (if battery not a concern)
  if (support.av1 && !preferHardware) {
    const av1Variant = variants.find(v => v.codec === 'av1')
    if (av1Variant) {
      return codecVariantToSource(av1Variant)
    }
  }
  
  // HEVC/H.265 (good middle ground if supported)
  if (support.hevc) {
    const hevcVariant = variants.find(v => v.codec === 'hevc')
    if (hevcVariant) {
      return codecVariantToSource(hevcVariant)
    }
  }
  
  // VP9 as middle ground
  if (support.vp9) {
    const vp9Variant = variants.find(v => v.codec === 'vp9')
    if (vp9Variant) {
      return codecVariantToSource(vp9Variant)
    }
  }
  
  // H.264 fallback (universally supported)
  const h264Variant = variants.find(v => v.codec === 'h264')
  if (h264Variant) {
    return codecVariantToSource(h264Variant)
  }
  
  // Default: use primary CID with auto codec detection
  const cid = video.filecoinCid || video.encryptedCid
  return {
    url: buildIpfsUrlInternal(cid),
    codec: 'auto',
    quality: CODEC_QUALITY_SCORES.auto,
  }
}

/**
 * Convert a codec variant to a video source.
 * 
 * @param variant - Codec variant from video entity
 * @returns Video source object
 */
function codecVariantToSource(variant: CodecVariant): VideoSource {
  return {
    url: variant.url || buildIpfsUrlInternal(variant.cid),
    codec: variant.codec,
    quality: variant.qualityScore || CODEC_QUALITY_SCORES[variant.codec] || 80,
    bitrate: variant.bitrate,
    resolution: variant.resolution,
    fileSize: variant.fileSize,
  }
}

/**
 * Build the fallback chain for a video.
 * 
 * Creates an ordered list of sources to try if the primary fails.
 * 
 * @param video - Video entity
 * @returns Ordered array of video sources
 */
function buildFallbackChain(video: Video): VideoSource[] {
  const chain: VideoSource[] = []
  const variants = video.codecVariants || []
  
  // Add all available variants in priority order
  // AV1 first (best quality/size ratio)
  const av1Variant = variants.find(v => v.codec === 'av1')
  if (av1Variant) chain.push(codecVariantToSource(av1Variant))
  
  // HEVC second
  const hevcVariant = variants.find(v => v.codec === 'hevc')
  if (hevcVariant) chain.push(codecVariantToSource(hevcVariant))
  
  // VP9 third
  const vp9Variant = variants.find(v => v.codec === 'vp9')
  if (vp9Variant) chain.push(codecVariantToSource(vp9Variant))
  
  // H.264 last fallback
  const h264Variant = variants.find(v => v.codec === 'h264')
  if (h264Variant) chain.push(codecVariantToSource(h264Variant))
  
  // Always add default as last resort (avoid duplicates)
  const defaultCid = video.filecoinCid || video.encryptedCid
  if (defaultCid) {
    const defaultUrl = buildIpfsUrlInternal(defaultCid)
    const alreadyInChain = chain.some(s => s.url === defaultUrl)
    
    if (!alreadyInChain) {
      chain.push({
        url: defaultUrl,
        codec: 'auto',
        quality: CODEC_QUALITY_SCORES.auto,
      })
    }
  }
  
  return chain
}

/**
 * Filter sources by maximum quality.
 * 
 * @param sources - Array of video sources
 * @param maxQuality - Maximum quality allowed
 * @returns Filtered array
 */
function filterByMaxQuality(
  sources: VideoSource[],
  maxQuality: string
): VideoSource[] {
  const maxHeight = parseInt(maxQuality.replace(/[^0-9]/g, '')) || 1080
  
  return sources.filter(source => {
    if (!source.resolution) return true
    return source.resolution.height <= maxHeight
  })
}

// ============================================================================
// Hook
// ============================================================================

/**
 * React hook for selecting optimal video source based on codec support.
 * 
 * This hook:
 * 1. Detects browser codec support (AV1, H.264, VP9, HEVC)
 * 2. Selects the best available video variant
 * 3. Provides a fallback chain for error recovery
 * 4. Indicates if software decoding is being used
 * 
 * @param options - Hook options
 * @returns Video source selection state and controls
 * 
 * @example
 * ```typescript
 * function VideoPlayer({ video }) {
 *   const { 
 *     source, 
 *     isLoading, 
 *     fallbackChain, 
 *     tryNextSource,
 *     isSoftwareDecode 
 *   } = useOptimalVideoSource({ video })
 * 
 *   if (isLoading) return <Loading />
 *   
 *   return (
 *     <video 
 *       src={source?.url} 
 *       onError={tryNextSource}
 *     />
 *   )
 * }
 * ```
 */
export function useOptimalVideoSource(
  options: UseOptimalVideoSourceOptions
): UseOptimalVideoSourceReturn {
  const { video, preferHardware = true, maxQuality, enabled = true } = options
  
  const [codecSupport, setCodecSupport] = useState<CodecSupport | null>(null)
  const [selectedSource, setSelectedSource] = useState<VideoSource | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [currentSourceIndex, setCurrentSourceIndex] = useState(0)
  const [isSoftwareDecode, setIsSoftwareDecode] = useState(false)
  
  // Track if component is mounted
  const isMountedRef = useRef(true)
  
  // Store the full fallback chain
  const fallbackChainRef = useRef<VideoSource[]>([])
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])
  
  /**
   * Detect codec support and select optimal source.
   */
  const detectAndSelect = useCallback(async () => {
    if (!video || !enabled) {
      setIsLoading(false)
      return
    }
    
    setIsLoading(true)
    setError(null)
    setCurrentSourceIndex(0)
    
    try {
      // Detect codec support
      const support = await detectCodecSupport()
      
      if (!isMountedRef.current) return
      
      setCodecSupport(support)
      
      // Build fallback chain
      const chain = buildFallbackChain(video)
      fallbackChainRef.current = chain
      
      // Apply quality filter if specified
      const filteredChain = maxQuality 
        ? filterByMaxQuality(chain, maxQuality)
        : chain
      
      // Select optimal source
      const optimal = selectOptimalSource(video, support, preferHardware)
      
      // Check if using software decode (AV1 without hardware)
      const isSoftware = optimal.codec === 'av1' && 
                         support.av1 && 
                         !support.av1Hardware
      setIsSoftwareDecode(isSoftware)
      
      // Find the index of the optimal source in the chain
      const optimalIndex = filteredChain.findIndex(s => s.url === optimal.url)
      setCurrentSourceIndex(optimalIndex >= 0 ? optimalIndex : 0)
      
      if (isMountedRef.current) {
        setSelectedSource(optimal)
        setIsLoading(false)
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err : new Error('Failed to detect codec support'))
        setIsLoading(false)
      }
    }
  }, [video, preferHardware, maxQuality, enabled])
  
  // Run detection on mount or when dependencies change
  useEffect(() => {
    detectAndSelect()
  }, [detectAndSelect])
  
  /**
   * Try the next source in the fallback chain.
   * 
   * @returns True if there was a next source to try
   */
  const tryNextSource = useCallback((): boolean => {
    const chain = fallbackChainRef.current
    const nextIndex = currentSourceIndex + 1
    
    if (nextIndex < chain.length) {
      setCurrentSourceIndex(nextIndex)
      setSelectedSource(chain[nextIndex])
      
      // Check if switching to software decode
      if (chain[nextIndex].codec === 'av1' && codecSupport) {
        setIsSoftwareDecode(!codecSupport.av1Hardware)
      } else {
        setIsSoftwareDecode(false)
      }
      
      return true
    }
    
    return false
  }, [currentSourceIndex, codecSupport])
  
  /**
   * Retry detection and source selection.
   */
  const retry = useCallback(() => {
    detectAndSelect()
  }, [detectAndSelect])
  
  // Get current source from fallback chain or selected source
  const currentSource = fallbackChainRef.current[currentSourceIndex] || selectedSource
  
  return {
    source: currentSource,
    codecSupport,
    isLoading,
    error,
    fallbackChain: fallbackChainRef.current,
    currentSourceIndex,
    tryNextSource,
    retry,
    isSoftwareDecode,
  }
}

// ============================================================================
// Additional Hooks
// ============================================================================

/**
 * Simple hook that just returns codec support without video selection.
 * 
 * @returns Codec support information
 */
export function useCodecSupport(): {
  support: CodecSupport | null
  isLoading: boolean
  error: Error | null
  retry: () => void
} {
  const [support, setSupport] = useState<CodecSupport | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  
  const detect = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      const result = await detectCodecSupport()
      setSupport(result)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Detection failed'))
    } finally {
      setIsLoading(false)
    }
  }, [])
  
  useEffect(() => {
    detect()
  }, [detect])
  
  return {
    support,
    isLoading,
    error,
    retry: detect,
  }
}
