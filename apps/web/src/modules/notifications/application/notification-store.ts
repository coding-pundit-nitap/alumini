export type NotificationRow = {
  id: string;
  type: string;
  category: "TRANSACTIONAL" | "ENGAGEMENT";
  payload: Record<string, unknown>;
  readAt: Date | null;
  createdAt: Date;
};

export type EmailDeliveryRow = {
  id: string;
  notificationId: string;
  type: string;
  recipient: { id: string; email: string };
  attempts: number;
  lastError: string | null;
  updatedAt: Date;
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
  /** Dedupe key (the email job id) when the notification's EMAIL delivery is FAILED, else null. */
  failedEmailJobId(notificationId: string): Promise<string | null>;
  /** EMAIL deliveries of one status, newest first (`updated_at DESC, id DESC`), keyset-paged. */
  listEmailDeliveries(input: {
    status: "FAILED" | "PENDING";
    after?: { updatedAt: Date; id: string };
    updatedBefore?: Date;
    take: number;
  }): Promise<EmailDeliveryRow[]>;
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
