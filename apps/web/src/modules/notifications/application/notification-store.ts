export type NotificationRow = {
  id: string;
  type: string;
  category: "TRANSACTIONAL" | "ENGAGEMENT";
  payload: Record<string, unknown>;
  readAt: Date | null;
  createdAt: Date;
};

export type NotificationStore = {
  insert(input: {
    recipientId: string;
    type: string;
    category: "TRANSACTIONAL" | "ENGAGEMENT";
    payload: Record<string, unknown>;
    dedupeKey: string;
  }): Promise<{ id: string; created: boolean }>;
  recordDelivery(input: {
    notificationId: string;
    channel: "IN_APP" | "EMAIL";
    status: "PENDING" | "SENT" | "FAILED";
    lastError?: string;
    providerMessageId?: string;
  }): Promise<void>;
  list(input: {
    recipientId: string;
    cursor?: { createdAt: Date; id: string };
    limit: number;
  }): Promise<{ items: NotificationRow[]; nextCursor: string | null }>;
  markRead(input: { recipientId: string; id: string }): Promise<boolean>;
  /** True when the row exists and belongs to `recipientId` (read or not). */
  exists(input: { recipientId: string; id: string }): Promise<boolean>;
  markAllRead(recipientId: string): Promise<number>;
  unreadCountFromDb(recipientId: string): Promise<number>;
  getPreferences(
    userId: string
  ): Promise<{ domain: string; channel: string; enabled: boolean }[]>;
  setPreference(input: {
    userId: string;
    domain:
      | "CONNECTION"
      | "MENTORSHIP"
      | "JOB"
      | "EVENT"
      | "MESSAGE"
      | "POST"
      | "ACHIEVEMENT"
      | "MODERATION";
    channel: "IN_APP" | "EMAIL";
    enabled: boolean;
  }): Promise<void>;
};
