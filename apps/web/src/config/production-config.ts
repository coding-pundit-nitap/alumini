/**
 * What a production web instance cannot run without (spec 16 S-11). Checked once at startup
 * (instrumentation.ts), so a release missing its auth secret fails to start instead of starting, reporting
 * healthy and answering every sign-in with a 500. Names the problems, never the values.
 */
const REQUIRED = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "REDIS_URL",
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
] as const;

export function assertProductionConfig(
  source: Record<string, string | undefined>
): void {
  if (source.NODE_ENV !== "production") return;

  const problems = REQUIRED.filter((name) => !source[name]).map(
    (name) => `${name} is not set`
  );
  if (
    (source.BETTER_AUTH_SECRET ?? "").length > 0 &&
    source.BETTER_AUTH_SECRET!.length < 32
  )
    problems.push("BETTER_AUTH_SECRET must be at least 32 characters");
  if (source.BETTER_AUTH_URL) {
    const url = new URL(source.BETTER_AUTH_URL);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    // Secure cookies and HSTS depend on it (NFR-SEC-003); plain HTTP only for a production build run locally.
    if (url.protocol !== "https:" && !local)
      problems.push("BETTER_AUTH_URL must be https:// in production");
  }

  if (problems.length > 0) {
    throw new Error(`Refusing to start: ${problems.join("; ")}`);
  }
}

/**
 * The startup hook's entry point. Next.js catches an error thrown from `register()` and keeps serving 500s,
 * so a refusal exits the process instead: the container stops and the orchestrator sees a failed release.
 */
export function exitIfMisconfigured(
  source: Record<string, string | undefined> = process.env
): void {
  try {
    assertProductionConfig(source);
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "fatal",
        event: "web.startup.refused",
        message: (error as Error).message,
      })
    );
    process.exit(1);
  }
}
