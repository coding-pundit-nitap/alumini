import { headers } from "next/headers";

/**
 * Best effort: the first `x-forwarded-for` entry, else `x-real-ip`, else a
 * shared "unknown" bucket. Per-account limits are the ones that must hold.
 */
export async function getClientIp(): Promise<string> {
  const requestHeaders = await headers();
  return (
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    requestHeaders.get("x-real-ip")?.trim() ||
    "unknown"
  );
}
