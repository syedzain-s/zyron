/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['three'],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
