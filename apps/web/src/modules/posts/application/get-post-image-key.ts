import { PERMISSIONS } from "@nitap/database/permissions";

import { NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import type { Authorize } from "./authz";
import type { PostsStore } from "./posts-store";

/**
 * Serves only images a live post references, so an upload id alone (e.g. a private profile photo)
 * never resolves (spec UI-2).
 */
export function createGetPostImageKey(deps: {
  store: PostsStore;
  authorize: Authorize;
}) {
  return async function getPostImageKey(args: {
    actor: Actor | null;
    uploadId: string;
  }): Promise<{ objectKey: string }> {
    deps.authorize(args.actor, PERMISSIONS.POST_INTERACT);
    const image = await deps.store.transaction((tx) =>
      tx.findPostImage(args.uploadId)
    );
    if (!image) throw new NotFoundError();
    return image;
  };
}
