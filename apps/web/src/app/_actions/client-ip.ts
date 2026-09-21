import { headers } from "next/headers";

/**
 * The caller's address for per-IP limits: the first `x-forwarded-for` entry (set by the platform proxy),
 * else `x-real-ip`, else one shared "unknown" bucket. Best-effort by nature (a client can send its own
 * header when no trusted proxy sits in front), so per-account limits are the ones that must hold.
 */
export async function getClientIp(): Promise<string> {
  const requestHeaders = await headers();
  return (
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    requestHeaders.get("x-real-ip")?.trim() ||
    "unknown"
  );
}
