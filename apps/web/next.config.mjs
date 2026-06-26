/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages ship raw TS/CSS — let Next transpile them.
  transpilePackages: ['@safecity/shared', '@safecity/design-tokens'],
};

export default nextConfig;
