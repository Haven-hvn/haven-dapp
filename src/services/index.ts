/**
 * Services Index
 *
 * Central export point for all application services.
 */

// Cache Service
export {
  VideoCacheService,
  createVideoCacheService,
  getVideoCacheService,
  clearServiceInstances,
} from './cacheService'

// Video Service
export {
  fetchAllVideos,
  fetchLibraryVideos,
  fetchVideos,
  fetchVideoById,
  fetchVideoByIdWithCache,
  pickMostRecentVideos,
} from './videoService'

export type { FetchVideosOptions } from './videoService'
