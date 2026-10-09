import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";
import path from "node:path";

import { staticSecurityHeaders } from "./src/infrastructure/http/security-headers";

// One .env at the repo root serves the workspace. forceReload replaces what Next already loaded,
// so apps/web/.env* files are not used.
loadEnvConfig(
  path.resolve(process.cwd(), "../.."),
  process.env.NODE_ENV !== "production",
  console,
  true
);

const nextConfig: NextConfig = {
  transpilePackages: [
    "@nitap/ui",
    "@nitap/database",
    "@nitap/observability",
    "@nitap/jobs",
    "@nitap/search",
  ],
  // Loaded with Node's require, not bundled: the error tracker's SDK patches Node internals.
  serverExternalPackages: ["@sentry/node"],
  poweredByHeader: false,
  // deploymentId comes from NEXT_DEPLOYMENT_ID (the git SHA, set in docker/web.Dockerfile).
  // Standalone output is traced from the repo root so workspace packages are included.
  ...(process.env.NEXT_OUTPUT === "standalone"
    ? {
        output: "standalone" as const,
        outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
      }
    : {}),
  // Every response, static assets included. The CSP is per request, so it is set in the proxy.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: staticSecurityHeaders({
          production: process.env.NODE_ENV === "production",
        }),
      },
    ];
  },
  // S3_PUBLIC_PATH is served by src/app/storage/[...path]/route.ts, not a rewrite: rewrites are fixed at build
  // time, and the image must take its storage endpoint from the runtime environment.
};

export default nextConfig;
