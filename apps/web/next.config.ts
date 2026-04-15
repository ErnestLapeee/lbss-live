import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Pre-built workspace package (packages/shared/dist); keeps server/client bundles in sync
  transpilePackages: ['@lbss/shared'],
};

export default nextConfig;
