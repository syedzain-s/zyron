/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['three'],
  experimental: {
    serverComponentsExternalPackages: ['@napi-rs/canvas', 'unpdf', 'pdfjs-dist'],
  },
  eslint: { ignoreDuringBuilds: true },
  webpack: (config, { isServer, dev }) => {
    // Windows hot reload can retain references to numeric chunks after a
    // route recompiles. A fresh in-memory graph is safer in development.
    if (dev) config.cache = false;
    if (isServer) {
      // Native .node binaries must be required at runtime, never bundled.
      config.externals.push('@napi-rs/canvas', 'unpdf', 'pdfjs-dist');
    } else {
      // The browser never needs these; stub them so a stray import can't drag
      // a Windows binary into the client bundle.
      config.resolve.alias['@napi-rs/canvas'] = false;
      config.resolve.alias['unpdf'] = false;
      config.resolve.alias['pdfjs-dist'] = false;
    }
    return config;
  },
};

export default nextConfig;
