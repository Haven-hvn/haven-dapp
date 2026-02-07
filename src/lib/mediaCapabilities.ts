/**
 * Media Capabilities Detection
 * 
 * Detects video codec support using the MediaCapabilities API and
 * provides fallback detection for older browsers. Used to select
 * optimal video sources (AV1, H.264, VP9) based on browser support.
 * 
 * @module lib/mediaCapabilities
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Codec support information for a browser.
 */
export interface CodecSupport {
  /** Whether AV1 is supported */
  av1: boolean
  /** Whether AV1 has hardware acceleration */
  av1Hardware: boolean
  /** Whether H.264 is supported */
  h264: boolean
  /** Whether VP9 is supported */
  vp9: boolean
  /** Whether HEVC/H.265 is supported */
  hevc: boolean
}

/**
 * Video codec type.
 */
export type VideoCodec = 'av1' | 'h264' | 'vp9' | 'hevc' | 'auto'

/**
 * Media capabilities detection result.
 */
export interface MediaCapabilitiesResult {
  /** Codec support information */
  support: CodecSupport
  /** Whether MediaCapabilities API is available */
  apiAvailable: boolean
  /** Detection timestamp */
  detectedAt: Date
}

// ============================================================================
// Constants
// ============================================================================

/**
 * AV1 Main Profile, Level 4.0 configuration for 1080p video.
 * Used for capability detection.
 */
const AV1_TEST_CONFIG: MediaDecodingConfiguration = {
  type: 'file',
  video: {
    contentType: 'video/mp4; codecs="av01.0.04M.08"',
    width: 1920,
    height: 1080,
    bitrate: 5000000,
    framerate: 30,
  },
}

/**
 * H.264 Baseline Profile configuration for 1080p video.
 */
const H264_TEST_CONFIG: MediaDecodingConfiguration = {
  type: 'file',
  video: {
    contentType: 'video/mp4; codecs="avc1.42001E"',
    width: 1920,
    height: 1080,
    bitrate: 5000000,
    framerate: 30,
  },
}

/**
 * VP9 Profile 0 configuration for 1080p video.
 */
const VP9_TEST_CONFIG: MediaDecodingConfiguration = {
  type: 'file',
  video: {
    contentType: 'video/webm; codecs="vp09.00.10.08"',
    width: 1920,
    height: 1080,
    bitrate: 5000000,
    framerate: 30,
  },
}

/**
 * HEVC Main Profile configuration for 1080p video.
 */
const HEVC_TEST_CONFIG: MediaDecodingConfiguration = {
  type: 'file',
  video: {
    contentType: 'video/mp4; codecs="hev1.1.6.L93.B0"',
    width: 1920,
    height: 1080,
    bitrate: 5000000,
    framerate: 30,
  },
}

// ============================================================================
// Detection Functions
// ============================================================================

/**
 * Check if the MediaCapabilities API is available.
 * 
 * @returns True if the API is available
 */
export function isMediaCapabilitiesSupported(): boolean {
  return typeof navigator !== 'undefined' && 
         'mediaCapabilities' in navigator &&
         typeof navigator.mediaCapabilities?.decodingInfo === 'function'
}

/**
 * Detect codec support using MediaCapabilities API.
 * 
 * This function checks for support of AV1, H.264, VP9, and HEVC
 * using the modern MediaCapabilities API for accurate detection.
 * 
 * @returns Promise resolving to codec support information
 * 
 * @example
 * ```typescript
 * const support = await detectCodecSupport()
 * if (support.av1) {
 *   console.log('AV1 is supported')
 * }
 * ```
 */
export async function detectCodecSupport(): Promise<CodecSupport> {
  const support: CodecSupport = {
    av1: false,
    av1Hardware: false,
    h264: false,
    vp9: false,
    hevc: false,
  }

  // Check if MediaCapabilities API is available
  if (!isMediaCapabilitiesSupported()) {
    // Fallback: use canPlayType for basic detection
    return detectCodecSupportFallback()
  }

  // Check AV1 support
  try {
    const av1Info = await navigator.mediaCapabilities.decodingInfo(AV1_TEST_CONFIG)
    support.av1 = av1Info.supported
    support.av1Hardware = av1Info.powerEfficient || false
  } catch {
    // AV1 not supported or error in detection
    support.av1 = false
  }

  // Check H.264 support
  try {
    const h264Info = await navigator.mediaCapabilities.decodingInfo(H264_TEST_CONFIG)
    support.h264 = h264Info.supported
  } catch {
    // Assume H.264 is supported (universal fallback)
    support.h264 = true
  }

  // Check VP9 support
  try {
    const vp9Info = await navigator.mediaCapabilities.decodingInfo(VP9_TEST_CONFIG)
    support.vp9 = vp9Info.supported
  } catch {
    support.vp9 = false
  }

  // Check HEVC support
  try {
    const hevcInfo = await navigator.mediaCapabilities.decodingInfo(HEVC_TEST_CONFIG)
    support.hevc = hevcInfo.supported
  } catch {
    support.hevc = false
  }

  return support
}

/**
 * Fallback codec detection using canPlayType.
 * Used when MediaCapabilities API is not available.
 * 
 * @returns Codec support information
 */
function detectCodecSupportFallback(): CodecSupport {
  const support: CodecSupport = {
    av1: false,
    av1Hardware: false,
    h264: false,
    vp9: false,
    hevc: false,
  }

  // Create a temporary video element for detection
  const video = document.createElement('video')

  // Check AV1
  support.av1 = video.canPlayType('video/mp4; codecs="av01.0.04M.08"') === 'probably'

  // Check H.264 (assume supported if we can create video element)
  support.h264 = video.canPlayType('video/mp4; codecs="avc1.42001E"') !== ''

  // Check VP9
  support.vp9 = video.canPlayType('video/webm; codecs="vp09.00.10.08"') === 'probably'

  // Check HEVC
  support.hevc = video.canPlayType('video/mp4; codecs="hev1.1.6.L93.B0"') === 'probably'

  return support
}

/**
 * Synchronous check for AV1 support.
 * 
 * Note: This is less accurate than the async version but can be
 * used for immediate UI decisions before async detection completes.
 * 
 * @returns True if AV1 appears to be supported
 */
export function canPlayAv1(): boolean {
  if (typeof document === 'undefined') return false
  
  const video = document.createElement('video')
  return video.canPlayType('video/mp4; codecs="av01.0.04M.08"') === 'probably'
}

/**
 * Synchronous check for H.264 support.
 * 
 * @returns True if H.264 appears to be supported
 */
export function canPlayH264(): boolean {
  if (typeof document === 'undefined') return true // Assume supported
  
  const video = document.createElement('video')
  return video.canPlayType('video/mp4; codecs="avc1.42001E"') !== ''
}

/**
 * Synchronous check for VP9 support.
 * 
 * @returns True if VP9 appears to be supported
 */
export function canPlayVp9(): boolean {
  if (typeof document === 'undefined') return false
  
  const video = document.createElement('video')
  return video.canPlayType('video/webm; codecs="vp09.00.10.08"') === 'probably'
}

/**
 * Get the best supported codec synchronously.
 * 
 * Priority: AV1 > VP9 > H.264
 * 
 * @returns The best codec that appears to be supported
 */
export function getBestCodecSync(): VideoCodec {
  if (canPlayAv1()) return 'av1'
  if (canPlayVp9()) return 'vp9'
  return 'h264'
}

/**
 * Get detailed media capabilities including support and hardware info.
 * 
 * @returns Promise resolving to full capabilities result
 */
export async function getMediaCapabilities(): Promise<MediaCapabilitiesResult> {
  const support = await detectCodecSupport()
  
  return {
    support,
    apiAvailable: isMediaCapabilitiesSupported(),
    detectedAt: new Date(),
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a specific codec configuration is supported.
 * 
 * @param config - MediaDecodingConfiguration to test
 * @returns Promise resolving to detailed support info
 */
export async function checkCodecSupport(
  config: MediaDecodingConfiguration
): Promise<{ supported: boolean; powerEfficient: boolean; smooth: boolean }> {
  if (!isMediaCapabilitiesSupported()) {
    // Fallback using canPlayType
    const video = document.createElement('video')
    const contentType = config.video?.contentType
    if (!contentType) {
      return {
        supported: false,
        powerEfficient: false,
        smooth: false,
      }
    }
    const canPlay = video.canPlayType(contentType)
    return {
      supported: canPlay === 'probably' || canPlay === 'maybe',
      powerEfficient: false,
      smooth: false,
    }
  }

  try {
    const info = await navigator.mediaCapabilities.decodingInfo(config)
    return {
      supported: info.supported,
      powerEfficient: info.powerEfficient,
      smooth: info.smooth,
    }
  } catch {
    return {
      supported: false,
      powerEfficient: false,
      smooth: false,
    }
  }
}

/**
 * Get a human-readable description of codec support.
 * 
 * @param support - Codec support information
 * @returns Formatted description string
 */
export function formatCodecSupport(support: CodecSupport): string {
  const parts: string[] = []
  
  if (support.av1) {
    parts.push(support.av1Hardware ? 'AV1 (HW)' : 'AV1 (SW)')
  }
  if (support.h264) parts.push('H.264')
  if (support.vp9) parts.push('VP9')
  if (support.hevc) parts.push('HEVC')
  
  return parts.join(', ') || 'None detected'
}

/**
 * Create a MediaDecodingConfiguration for testing a specific codec.
 * 
 * @param codec - Codec type to create config for
 * @param options - Optional video parameters
 * @returns MediaDecodingConfiguration for the codec
 */
export function createCodecConfig(
  codec: VideoCodec,
  options?: {
    width?: number
    height?: number
    bitrate?: number
    framerate?: number
  }
): MediaDecodingConfiguration | null {
  const {
    width = 1920,
    height = 1080,
    bitrate = 5000000,
    framerate = 30,
  } = options || {}

  const baseConfig = {
    type: 'file' as const,
    video: {
      width,
      height,
      bitrate,
      framerate,
    },
  }

  switch (codec) {
    case 'av1':
      return {
        ...baseConfig,
        video: {
          ...baseConfig.video,
          contentType: 'video/mp4; codecs="av01.0.04M.08"',
        },
      }
    case 'h264':
      return {
        ...baseConfig,
        video: {
          ...baseConfig.video,
          contentType: 'video/mp4; codecs="avc1.42001E"',
        },
      }
    case 'vp9':
      return {
        ...baseConfig,
        video: {
          ...baseConfig.video,
          contentType: 'video/webm; codecs="vp09.00.10.08"',
        },
      }
    case 'hevc':
      return {
        ...baseConfig,
        video: {
          ...baseConfig.video,
          contentType: 'video/mp4; codecs="hev1.1.6.L93.B0"',
        },
      }
    default:
      return null
  }
}
