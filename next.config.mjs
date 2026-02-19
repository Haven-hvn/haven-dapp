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
  
  // Webpack configuration (fallback for production builds if needed)
  webpack: (config, { isServer }) => {
    // Fallback for Node.js modules that Lit SDK references but doesn't use in browser
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        path: false,
        os: false,
        url: false,
        http: false,
        https: false,
        zlib: false,
        querystring: false,
        assert: false,
        constants: false,
        timers: false,
        console: false,
        util: false,
        buffer: false,
        events: false,
        string_decoder: false,
        punycode: false,
        domain: false,
        dns: false,
        dgram: false,
        cluster: false,
        module: false,
        v8: false,
        vm: false,
        async_hooks: false,
        inspector: false,
        perf_hooks: false,
        trace_events: false,
        worker_threads: false,
      };
    }

    // Fix for broken @lit-protocol packages missing root index.js files
    // Also preserve the React Native mock alias
    config.resolve.alias = {
      ...config.resolve.alias,
      '@react-native-async-storage/async-storage': join(__dirname, 'src/mocks/react-native-async-storage.js'),
      '@lit-protocol/lit-client': join(__dirname, 'node_modules/@lit-protocol/lit-client/src'),
      '@lit-protocol/auth': join(__dirname, 'node_modules/@lit-protocol/auth/src'),
    };
    return config;
  },
  
  // Transpile Lit Protocol packages
  transpilePackages: [
    '@lit-protocol/lit-client',
    '@lit-protocol/auth',
    '@lit-protocol/auth-helpers',
    '@lit-protocol/networks',
    '@lit-protocol/constants',
    '@lit-protocol/contracts',
    '@lit-protocol/crypto',
    '@lit-protocol/uint8arrays',
    '@lit-protocol/nacl',
    '@lit-protocol/logger',
    '@lit-protocol/schemas',
    '@lit-protocol/accs-schemas',
    '@lit-protocol/access-control-conditions',
    '@lit-protocol/access-control-conditions-schemas',
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
