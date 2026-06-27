import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Self-contained server output for the Docker image.
  output: 'standalone',
  // Trace files from the monorepo root so standalone bundles workspace deps.
  experimental: {
    outputFileTracingRoot: path.join(__dirname, '../../'),
  },
  // Workspace packages ship raw TS/CSS — let Next transpile them.
  transpilePackages: ['@safecity/shared', '@safecity/design-tokens'],
};

export default nextConfig;
