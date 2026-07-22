import type { NextConfig } from 'next';

// `npm run dev` bundles the local workspace brometal package; `npm run prod`
// (BROMETAL_SOURCE=npm) bundles the published npm package instead, so the
// production build exercises exactly what registry users install.
const useNpmPackage = process.env.BROMETAL_SOURCE === 'npm';

const nextConfig: NextConfig = {
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
