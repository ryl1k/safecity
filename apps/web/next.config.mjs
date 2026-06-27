import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Standalone output only when explicitly requested (Docker sets NEXT_OUTPUT=standalone).
  // Running it on every local build mutates node_modules/next and corrupts the pnpm store.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  // Trace files from the monorepo root so standalone bundles workspace deps.
  experimental: {
    outputFileTracingRoot: path.join(__dirname, '../../'),
  },
  // Workspace packages ship raw TS/CSS — let Next transpile them.
  transpilePackages: ['@safecity/shared', '@safecity/design-tokens'],
};

export default nextConfig;
