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

    // Fix for broken @lit-protocol packages missing root index.js files
    config.resolve.alias = {
      ...config.resolve.alias,
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
