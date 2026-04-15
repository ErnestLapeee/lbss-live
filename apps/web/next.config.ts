import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@lbss/shared'],
  // @lbss/shared uses `.js` extensions in TS sources (Node ESM style). Webpack must map those to `.ts`.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
    };
    return config;
  },
};

export default nextConfig;
