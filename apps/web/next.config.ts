import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";
import path from "node:path";

import { staticSecurityHeaders } from "./src/infrastructure/http/security-headers";

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
  // Loaded with Node's require, not bundled: the error tracker's SDK patches Node internals (spec 13B B-1).
  serverExternalPackages: ["@sentry/node"],
  poweredByHeader: false,
  // deploymentId (version-skew protection, reliability §8.2) comes from NEXT_DEPLOYMENT_ID, which
  // docker/web.Dockerfile sets to the git SHA at build. Unset in development.
  // The container image (docker/web.Dockerfile) sets NEXT_OUTPUT=standalone: a self-contained server with only
  // the files it traces. Traced from the repository root so the workspace packages come along.
  ...(process.env.NEXT_OUTPUT === "standalone"
    ? {
        output: "standalone" as const,
        outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
      }
    : {}),
  // Every response, static assets included (spec 16 SD-3). The CSP is per request, so it is set in the proxy.
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
