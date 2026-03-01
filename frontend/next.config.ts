import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@unlink-xyz/react", "@unlink-xyz/core"],
  turbopack: {},
  productionBrowserSourceMaps: false,
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
        os: false,
        stream: false,
        worker_threads: false,
      };
    }
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      { module: /node-modules-polyfills/ },
      { message: /Invalid source map/ },
    ];
    return config;
  },
};

export default nextConfig;
