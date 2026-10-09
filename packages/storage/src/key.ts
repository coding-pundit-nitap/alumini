const PENDING_PREFIX = "uploads/pending/";

/**
 * The only way to build a pending-upload key: the client's filename never
 * becomes a storage key.
 */
export const pendingKey = (uploadId: string): string =>
  `${PENDING_PREFIX}${uploadId}`;

/** The only way to build a photo derivative's key. */
export const avatarKey = (userId: string, uploadId: string): string =>
  `avatars/${userId}/${uploadId}.webp`;

export const isPendingKey = (key: string): boolean =>
  key.startsWith(PENDING_PREFIX) && !key.includes("..");
