import { addTicks } from "./ticks";
import { transactionRunner } from "@/infrastructure/database/client";
import { outbox } from "@/infrastructure/outbox";
import { authorize, type Actor } from "@/modules/auth";
import {
  createAddComment,
  createCreatePost,
  createDeleteComment,
  createDeletePost,
  createGetPost,
  createGetPostImageKey,
  createListComments,
  createListFeed,
  createPrismaPostsStore,
  createReact,
  createUnreact,
  type PostAuthor,
} from "@/modules/posts";

import { getOwnProfile } from "./users";

/**
 * Wires the posts module to PostgreSQL (mirrors composition/messaging.ts's shape: flat, pre-bound
 * exports off one store/authorize pair — messaging.ts itself exports each use case as a top-level
 * const, not a single bundled object, despite how some task prose describes it).
 */
const store = createPrismaPostsStore({ runner: transactionRunner, outbox });
const deps = { store, authorize };

export const createPost = createCreatePost(deps);
export const deletePost = createDeletePost(deps);
const listFeedBare = createListFeed(deps);
export const listFeed: typeof listFeedBare = async (args) => {
  const page = await listFeedBare(args);
  await addTicks(
    page.posts,
    (post) => post.author.id,
    (post) => post.author
  );
  return page;
};
const getPostBare = createGetPost(deps);
export const getPost: typeof getPostBare = async (args) => {
  const post = await getPostBare(args);
  await addTicks(
    [post],
    (p) => p.author.id,
    (p) => p.author
  );
  return post;
};
export const getPostImageKey = createGetPostImageKey(deps);
export const addComment = createAddComment(deps);
export const deleteComment = createDeleteComment(deps);
const listCommentsBare = createListComments(deps);
export const listComments: typeof listCommentsBare = async (args) => {
  const page = await listCommentsBare(args);
  await addTicks(
    page.comments,
    (comment) => comment.author.id,
    (comment) => comment.author
  );
  return page;
};
export const react = createReact(deps);
export const unreact = createUnreact(deps);

/** The signed-in member as a post/comment author (avatar and name); undefined when their profile can't be read. */
export async function getViewerAuthor(
  actor: Actor
): Promise<PostAuthor | undefined> {
  try {
    const { userId, fullName, headline, photoUploadId } = await getOwnProfile({
      actor,
    });
    return { id: userId, fullName, headline, hasPhoto: photoUploadId != null };
  } catch {
    return undefined;
  }
}
