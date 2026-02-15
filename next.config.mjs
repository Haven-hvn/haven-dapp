import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Image optimization configuration
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'ipfs.io',
      },
      {
        protocol: 'https',
        hostname: '*.ipfs.dweb.link',
      },
      {
        protocol: 'https',
        hostname: 'gateway.ipfs.io',
      },
      {
        protocol: 'https',
        hostname: 'gateway.lighthouse.storage',
      },
      {
        protocol: 'https',
        hostname: '*.lighthouse.storage',
      },
    ],
    // Optimize images
    formats: ['image/webp', 'image/avif'],
    minimumCacheTTL: 60,
  },
  
  
  // Production source maps (disable for smaller builds)
  productionBrowserSourceMaps: false,
  
  // Turbopack configuration for Node.js polyfills (needed for Lit Protocol SDK)
  turbopack: {
    resolveAlias: {
      fs: './src/mocks/node-empty.js',
      net: './src/mocks/node-empty.js',
      tls: './src/mocks/node-empty.js',
      crypto: './src/mocks/node-empty.js',
      stream: './src/mocks/node-empty.js',
      path: './src/mocks/node-empty.js',
      os: './src/mocks/node-empty.js',
      url: './src/mocks/node-empty.js',
      http: './src/mocks/node-empty.js',
      https: './src/mocks/node-empty.js',
      zlib: './src/mocks/node-empty.js',
      querystring: './src/mocks/node-empty.js',
      assert: './src/mocks/node-empty.js',
      constants: './src/mocks/node-empty.js',
      timers: './src/mocks/node-empty.js',
      console: './src/mocks/node-empty.js',
      util: './src/mocks/node-empty.js',
      buffer: './src/mocks/node-empty.js',
      events: './src/mocks/node-empty.js',
      string_decoder: './src/mocks/node-empty.js',
      punycode: './src/mocks/node-empty.js',
      domain: './src/mocks/node-empty.js',
      dns: './src/mocks/node-empty.js',
      dgram: './src/mocks/node-empty.js',
      cluster: './src/mocks/node-empty.js',
      module: './src/mocks/node-empty.js',
      v8: './src/mocks/node-empty.js',
      vm: './src/mocks/node-empty.js',
      async_hooks: './src/mocks/node-empty.js',
      inspector: './src/mocks/node-empty.js',
      perf_hooks: './src/mocks/node-empty.js',
      trace_events: './src/mocks/node-empty.js',
      worker_threads: './src/mocks/node-empty.js',
    },
  },
  
  // Experimental features for optimization
  experimental: {
    // Optimize package imports
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons'],
  },
  
  // Webpack configuration to handle Lit Protocol SDK dependencies
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
      
      // Mock React Native specific modules that MetaMask SDK references
      // These are not needed for browser builds
      config.resolve.alias = {
        ...config.resolve.alias,
        '@react-native-async-storage/async-storage': join(__dirname, 'src/mocks/react-native-async-storage.js'),
      };
    }
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
  
  // Headers for security and caching
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
        ],
      },
      {
        // Cache static assets
        source: '/:all*(svg|jpg|jpeg|png|webp|avif|woff|woff2|ttf|otf)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        // Cache JS and CSS chunks
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
  
  // Redirects
  async redirects() {
    return [
      {
        source: '/home',
        destination: '/',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
