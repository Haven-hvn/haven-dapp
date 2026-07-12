// Mock for @react-native-async-storage/async-storage
// This module is only needed for React Native builds, not browser builds
// MetaMask SDK references it but doesn't require it for browser functionality

const mockStorage = {
  getItem: () => Promise.resolve(null),
  setItem: () => Promise.resolve(),
  removeItem: () => Promise.resolve(),
  mergeItem: () => Promise.resolve(),
  clear: () => Promise.resolve(),
  getAllKeys: () => Promise.resolve([]),
  flushGetRequests: () => {},
  multiGet: () => Promise.resolve([]),
  multiSet: () => Promise.resolve(),
  multiRemove: () => Promise.resolve(),
  multiMerge: () => Promise.resolve(),
  useAsyncStorage: () => ({
    getItem: () => Promise.resolve(null),
    setItem: () => Promise.resolve(),
    removeItem: () => Promise.resolve(),
  }),
};

export default mockStorage;
