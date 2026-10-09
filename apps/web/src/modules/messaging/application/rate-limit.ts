/**
 * `messages.send`: 60 a minute per member. `conversations.create`: 20 an hour,
 * the brake on mass first contact.
 */
export const SEND_RATE = { max: 60, window: 60 } as const;
export const CREATE_RATE = { max: 20, window: 60 * 60 } as const;

export type RateLimiter = {
  consume(
    key: string,
    rule: { max: number; window: number }
  ): Promise<{ allowed: boolean; retryAfter: number | null }>;
};
