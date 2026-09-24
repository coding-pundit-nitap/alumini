import { transactionRunner } from "@/infrastructure/database/client";
import { outbox } from "@/infrastructure/outbox";
import { authorize } from "@/modules/auth";
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
} from "@/modules/posts";

/**
 * Wires the posts module to PostgreSQL (mirrors composition/messaging.ts's shape: flat, pre-bound
 * exports off one store/authorize pair — messaging.ts itself exports each use case as a top-level
 * const, not a single bundled object, despite how some task prose describes it).
 */
const store = createPrismaPostsStore({ runner: transactionRunner, outbox });
const deps = { store, authorize };

export const createPost = createCreatePost(deps);
export const deletePost = createDeletePost(deps);
export const listFeed = createListFeed(deps);
export const getPost = createGetPost(deps);
export const getPostImageKey = createGetPostImageKey(deps);
export const addComment = createAddComment(deps);
export const deleteComment = createDeleteComment(deps);
export const listComments = createListComments(deps);
export const react = createReact(deps);
export const unreact = createUnreact(deps);
