import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export for JAMstack deployment
  output: 'export',
  
  // Image optimization disabled for static export
  images: {
    unoptimized: true,
  },
  
  
  // Production source maps (disable for smaller builds)
  productionBrowserSourceMaps: false,
  
  // Experimental features for optimization
  experimental: {
    // Optimize package imports - exclude appkit to avoid bundling issues
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons'],
  },
  
  // Note: Turbopack is not used because its resolveAlias applies globally
  // (server + client), which breaks server-side Node.js built-in modules.
  // Webpack's resolve.fallback correctly only applies to client bundles.
  // Both dev and build use --webpack flag instead.
  
  // Webpack configuration for @dfinity packages and browser polyfills
  webpack: (config, { isServer, webpack }) => {
    // Fallback for Node.js modules that @dfinity/agent may reference
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        path: false,
        os: false,
        crypto: false,
        stream: false,
        url: false,
        http: false,
        https: false,
        zlib: false,
        assert: false,
        buffer: false,
        events: false,
        util: false,
        ws: false,
      };

      config.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /^ws$/,
        })
      );
    }

    // Resolve haven-aol source directly (the package uses .js extensions in imports)
    config.resolve.alias = {
      ...config.resolve.alias,
      'haven-aol': join(__dirname, 'haven-aol-main/packages/typescript/src/index.ts'),
      '@react-native-async-storage/async-storage': join(__dirname, 'src/mocks/react-native-async-storage.js'),
      ws: join(__dirname, 'src/mocks/ws.js'),
    };

    // Allow .js extension imports to resolve to .ts files (ESM convention in haven-aol source)
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.js'],
    };

    return config;
  },
  
  // Transpile ICP/Haven-AOL packages
  transpilePackages: [
    'haven-aol',
    '@dfinity/agent',
    '@dfinity/candid',
    '@dfinity/principal',
    '@dfinity/vetkeys',
    '@filoz/synapse-sdk',
    '@filoz/synapse-core',
    '@web3-storage/data-segment',
  ],

  // HTTP headers configuration for Service Worker support
  async headers() {
    return [
      {
        // Service Worker file headers
        source: '/haven-sw.js',
        headers: [
          {
            // Allow the service worker to control the entire origin
            key: 'Service-Worker-Allowed',
            value: '/',
          },
          {
            // Prevent caching of the SW file to ensure updates propagate
            // The browser checks for byte-level changes on each navigation
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
        ],
      },
      {
        // Synthetic video routes served by Service Worker
        source: '/haven/v/:path*',
        headers: [
          {
            // These are synthetic routes that only exist in the Cache API
            // They are served by the Service Worker, not the Next.js server
            // no-store ensures the server returns a clean response if SW is not active
            key: 'Cache-Control',
            value: 'no-store',
          },
        ],
      },
    ];
  },
  
};

export default nextConfig;
