import type { NextConfig } from 'next';

// Development uses the workspace. Production aliases the same imports to the
// package Vercel refreshed from npm immediately before building.
const useNpmPackage = process.env.BROMETAL_SOURCE === 'npm';

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/demos',
        destination: '/examples',
        permanent: true,
      },
      {
        source: '/demos/:path*',
        destination: '/examples/:path*',
        permanent: true,
      },
    ];
  },
  webpack: (config) => {
    if (useNpmPackage) {
      config.resolve.alias = {
        ...config.resolve.alias,
        brometal: 'brometal-published',
      };
    }
    return config;
  },
};

export default nextConfig;
