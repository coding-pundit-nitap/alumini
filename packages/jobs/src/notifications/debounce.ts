/** The message notification debounce window. */
export const MESSAGE_DEBOUNCE_MS = 5 * 60_000;

export function debounceKeyFor(
  recipientId: string,
  conversationId: string
): string {
  return `notif:debounce:${recipientId}:${conversationId}`;
}

/** Whether a pending debounce window that started at `windowStartedAt` should flush by `now`. */
export function shouldFlush(
  windowStartedAt: Date,
  now: Date,
  windowMs: number
): boolean {
  return now.getTime() - windowStartedAt.getTime() >= windowMs;
}
