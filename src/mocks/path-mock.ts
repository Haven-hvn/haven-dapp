/**
 * Mock for Node.js path module in browser environment
 */
const join = (...args: string[]) => args.join('/');
const resolve = (...args: string[]) => args.join('/');
const relative = (from: string, to: string) => to;
const dirname = (p: string) => p.split('/').slice(0, -1).join('/') || '.';
const basename = (p: string, ext?: string) => {
  const base = p.split('/').pop() || '';
  return ext && base.endsWith(ext) ? base.slice(0, -ext.length) : base;
};
const extname = (p: string) => {
  const base = p.split('/').pop() || '';
  const idx = base.lastIndexOf('.');
  return idx > 0 ? base.slice(idx) : '';
};
const sep = '/';
const delimiter = ':';
const parse = (p: string) => ({
  root: '',
  dir: dirname(p),
  base: basename(p),
  ext: extname(p),
  name: basename(p).replace(extname(p), ''),
});
const format = (p: { dir?: string; base?: string }) => join(p.dir || '', p.base || '');
const normalize = (p: string) => p;
const isAbsolute = (p: string) => p.startsWith('/');

export {
  join,
  resolve,
  relative,
  dirname,
  basename,
  extname,
  sep,
  delimiter,
  parse,
  format,
  normalize,
  isAbsolute,
};

export default {
  join,
  resolve,
  relative,
  dirname,
  basename,
  extname,
  sep,
  delimiter,
  parse,
  format,
  normalize,
  isAbsolute,
};
