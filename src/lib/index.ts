/**
 * Library Utilities
 * 
 * Shared library functions and utilities for Haven Web DApp.
 * 
 * @module lib
 */

// Lit Protocol exports
export {
  initLitClient,
  getLitClient,
  getAuthManager,
  disconnectLitClient,
  isLitConnected,
  getLitNetwork,
  LitError,
  type LitClient,
} from './lit'

export {
  createLitAuthContext,
  createLitAuthContextWithResources,
  isAuthContextExpired,
  getAuthContextAddress,
  LitAuthError,
  type LitAuthContextOptions,
  type LitAuthContext,
} from './lit-auth'
export type { Account, Transport, Chain } from 'viem'

// Arkiv exports
export {
  createArkivClient,
  queryEntitiesByOwner,
  getEntity,
  checkArkivConnection,
  getAllEntitiesByOwner,
  parseEntityPayload,
  encodeEntityPayload,
  ArkivError,
  type ArkivEntity,
  type ArkivQueryOptions,
  type ArkivConnectionStatus,
} from './arkiv'

export {
  getArkivClient,
  resetArkivClient,
  hasArkivClient,
} from './arkiv-singleton'

// Formatting utilities
export {
  formatDuration,
  formatFileSize,
  formatDate,
  formatRelativeTime,
} from './format'

// General utilities
export { cn } from './utils'

// Cryptographic utilities
export {
  aesDecrypt,
  aesEncrypt,
  generateAESKey,
  generateIV,
  base64ToUint8Array,
  uint8ArrayToBase64,
  toArrayBuffer,
  toUint8Array,
  hexToUint8Array,
  uint8ArrayToHex,
  secureClear,
  secureCopy,
  sha256,
  sha256Hex,
  readFileAsArrayBuffer,
  readFileAsUint8Array,
  formatBytes,
  checkLargeFileSupport,
} from './crypto'

// Lit Decryption utilities
export {
  decryptAesKey,
  decryptCid,
  batchDecryptAesKeys,
  canDecrypt,
  getDecryptionErrorMessage,
  LitDecryptError,
  type DecryptKeyResult,
  type DecryptProgressCallback,
  type DecryptAesKeyOptions,
  type DecryptCidOptions,
} from './lit-decrypt'

// IPFS utilities
export {
  getIpfsConfig,
  buildIpfsUrl,
  buildIpfsUrls,
  buildIpfsPathUrl,
  normalizeCid,
  isValidCid,
  isGatewayHealthy,
  getHealthyGateways,
  getIpfsErrorMessage,
  IpfsError,
  IPFS_GATEWAYS,
  type IpfsConfig,
} from './ipfs'

// Synapse SDK utilities (Filecoin Onchain Cloud retrieval)
export {
  getSynapseInstance,
  resetSynapseInstance,
  downloadFromSynapse,
  getSynapseErrorMessage,
  SynapseError,
  type SynapseConfig,
} from './synapse'

// Media capabilities utilities
export {
  isMediaCapabilitiesSupported,
  detectCodecSupport,
  canPlayAv1,
  canPlayH264,
  canPlayVp9,
  getBestCodecSync,
  getMediaCapabilities,
  checkCodecSupport,
  formatCodecSupport,
  createCodecConfig,
  type CodecSupport,
  type VideoCodec,
  type MediaCapabilitiesResult,
} from './mediaCapabilities'
