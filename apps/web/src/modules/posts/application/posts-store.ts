export type PostRow = {
  id: string;
  authorId: string;
  chapterId: string | null;
  content: string;
  imageUrls: string[];
  linkUrl: string | null;
  postType: "TEXT" | "ACHIEVEMENT";
  deleted: boolean;
  createdAt: Date;
};
export type CommentRow = {
  id: string;
  postId: string;
  authorId: string;
  body: string;
  deleted: boolean;
  createdAt: Date;
};
export type PostsTx = {
  blockedBetween(x: string, y: string): Promise<boolean>;
  uploadsReady(ids: string[], ownerId: string): Promise<boolean>;
  insertPost(input: {
    authorId: string;
    chapterId: string | null;
    content: string;
    imageUrls: string[];
    linkUrl: string | null;
    postType: "TEXT" | "ACHIEVEMENT";
  }): Promise<PostRow>;
  findPost(id: string): Promise<PostRow | null>;
  softDeletePost(id: string): Promise<void>;
  listFeed(args: {
    limit: number;
    after: { createdAt: Date; id: string } | null;
  }): Promise<PostRow[]>;
  insertComment(input: {
    postId: string;
    authorId: string;
    body: string;
  }): Promise<CommentRow>;
  findComment(id: string): Promise<CommentRow | null>;
  softDeleteComment(id: string): Promise<void>;
  listComments(args: {
    postId: string;
    limit: number;
    after: { createdAt: Date; id: string } | null;
  }): Promise<CommentRow[]>;
  upsertReaction(input: {
    postId: string;
    userId: string;
    type: string;
  }): Promise<{ id: string }>;
  deleteReaction(postId: string, userId: string): Promise<void>;
  enqueue(event: {
    type: "post.created" | "comment.created" | "reaction.added";
    payload: unknown;
  }): Promise<void>;
};
export type PostsStore = {
  transaction<T>(work: (tx: PostsTx) => Promise<T>): Promise<T>;
};
