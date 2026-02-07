/**
 * React Hooks
 * 
 * Custom React hooks for Haven Web DApp.
 * 
 * @module hooks
 */

// Auth hooks
export { useAuthSync } from './useAuthSync'
export { useHydration } from './useHydration'

// Wallet hooks
export { useWalletError } from './useWalletError'

// Arkiv hooks
export { useArkivClient, useArkivEntities, useArkivQuery } from './useArkivClient'

// Video hooks
export {
  useVideos,
  useVideo,
  useVideoQuery,
  useInvalidateVideos,
  usePrefetchVideos,
  useVideosWithOptions,
  videoKeys,
  getVideoErrorMessage,
  type UseVideosReturn,
  type UseVideoReturn,
  type UseVideoQueryReturn,
  type UseInvalidateVideosReturn,
} from './useVideos'

export {
  useVideoSearch,
  useVideoTextSearch,
  useVideoFilter,
  useVideoSort,
  type VideoSortField,
  type SortOrder,
  type UseVideoSearchOptions,
  type UseVideoSearchReturn,
} from './useVideoSearch'

// Lit Protocol hooks
export { useLit, useLitAutoInit, type UseLitReturn } from './useLit'

// Video Decryption hooks
export {
  useVideoDecryption,
  useVideoDecryptionAuto,
  type DecryptionStatus,
  type UseVideoDecryptionReturn,
  type UseVideoDecryptionOptions,
} from './useVideoDecryption'

// CID Decryption hooks
export {
  useCidDecryption,
  useCidDecryptionAuto,
  useFullVideoDecryption,
  type CidDecryptionStatus,
  type UseCidDecryptionReturn,
  type UseCidDecryptionOptions,
  type UseFullVideoDecryptionReturn,
} from './useCidDecryption'

// IPFS Fetch hooks
export {
  useIpfsFetch,
  useIpfsFetchAuto,
  useEncryptedVideoFetch,
  type FetchProgress,
  type UseIpfsFetchReturn,
  type UseIpfsFetchOptions,
  type UseIpfsFetchAutoOptions,
  type UseEncryptedVideoFetchReturn,
  type UseEncryptedVideoFetchOptions,
} from './useIpfsFetch'

// Video source optimization hooks
export {
  useOptimalVideoSource,
  useCodecSupport,
  type VideoSource,
  type UseOptimalVideoSourceOptions,
  type UseOptimalVideoSourceReturn,
} from './useOptimalVideoSource'
