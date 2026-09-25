import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";
import path from "node:path";

// One .env at the repository root serves the whole workspace (see .env.example).
// cwd is apps/web when Next runs through `pnpm --filter @nitap/web`. Next has already loaded (and
// cached) the app directory's env files by the time this runs, so forceReload is required; it
// replaces that result, which means apps/web/.env* files are intentionally NOT used.
loadEnvConfig(
  path.resolve(process.cwd(), "../.."),
  process.env.NODE_ENV !== "production",
  console,
  true
);

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source; Next compiles them.
  transpilePackages: [
    "@nitap/ui",
    "@nitap/database",
    "@nitap/observability",
    "@nitap/jobs",
    "@nitap/search",
  ],
  poweredByHeader: false,
  // Keeps object storage off the browser: presigned URLs point at S3_PUBLIC_PATH on this origin and are
  // proxied to S3_ENDPOINT (Host is rewritten to the endpoint, so the signatures still match).
  async rewrites() {
    const { S3_PUBLIC_PATH, S3_ENDPOINT } = process.env;
    if (!S3_PUBLIC_PATH || !S3_ENDPOINT) return [];
    return [
      {
        source: `${S3_PUBLIC_PATH}/:path*`,
        destination: `${S3_ENDPOINT.replace(/\/$/, "")}/:path*`,
      },
    ];
  },
};

export default nextConfig;
