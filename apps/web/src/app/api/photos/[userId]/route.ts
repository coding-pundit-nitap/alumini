import { z } from "zod";

import { storage } from "@/composition/uploads";
import { getProfilePhotoKey } from "@/composition/users";
import { AppError } from "@/lib/errors";
import { getActor } from "@/modules/auth";

const PHOTO_URL_TTL_SECONDS = 60;

/** Re-checks visibility on every request and redirects to a short-lived presigned URL. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  const notFound = () => new Response(null, { status: 404 });
  if (!z.uuid().safeParse(userId).success) return notFound();

  try {
    const { objectKey } = await getProfilePhotoKey({
      actor: await getActor(),
      targetUserId: userId,
    });
    const url = await storage.presignDownload({
      key: objectKey,
      expiresInSeconds: PHOTO_URL_TTL_SECONDS,
    });
    return new Response(null, {
      status: 302,
      headers: { Location: url, "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    // 401/403/404 keep their status; only real failures become a 500.
    if (error instanceof AppError)
      return new Response(null, { status: error.status });
    throw error;
  }
}
