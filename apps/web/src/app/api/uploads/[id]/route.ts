import { z } from "zod";

import { getPostImageKey } from "@/composition/posts";
import { storage } from "@/composition/uploads";
import { AppError } from "@/lib/errors";
import { getActor } from "@/modules/auth";

const IMAGE_URL_TTL_SECONDS = 60;

/** Post images (spec UI-2): only uploads a live post references resolve; a fresh short-lived presigned GET each time. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const notFound = () => new Response(null, { status: 404 });
  if (!z.uuid().safeParse(id).success) return notFound();
  try {
    const { objectKey } = await getPostImageKey({
      actor: await getActor(),
      uploadId: id,
    });
    const url = await storage.presignDownload({
      key: objectKey,
      expiresInSeconds: IMAGE_URL_TTL_SECONDS,
    });
    return new Response(null, {
      status: 302,
      headers: { Location: url, "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof AppError && error.status === 404) return notFound();
    throw error;
  }
}
