/**
 * Mock for Node.js fs module in browser environment
 */
export const readFileSync = () => '';
export const writeFileSync = () => {};
export const existsSync = () => false;
export const mkdirSync = () => {};
export const readdirSync = () => [];
export const statSync = () => ({}) as any;
export const unlinkSync = () => {};
export const rmdirSync = () => {};
export const renameSync = () => {};
export const createWriteStream = () => ({ write: () => {}, end: () => {} });
export const createReadStream = () => ({ pipe: () => {}, on: () => {} });
export const promises = {
  readFile: () => Promise.resolve(''),
  writeFile: () => Promise.resolve(),
  mkdir: () => Promise.resolve(),
  readdir: () => Promise.resolve([]),
  stat: () => Promise.resolve({}),
  unlink: () => Promise.resolve(),
  rmdir: () => Promise.resolve(),
};

export default {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
  rmdirSync,
  renameSync,
  createWriteStream,
  createReadStream,
  promises,
};
