const BASE =
  process.env.MAILPIT_URL ??
  `http://localhost:${process.env.MAILPIT_UI_PORT ?? "8025"}`;

type Summary = { ID: string; Subject: string };

async function search(to: string): Promise<Summary[]> {
  const response = await fetch(
    `${BASE}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`
  );
  if (!response.ok) return [];
  return ((await response.json()) as { messages: Summary[] }).messages;
}

/** Polls Mailpit until a message to `to` (optionally matching `subject`) arrives; returns its text. */
export async function waitForEmail(
  to: string,
  options: { subject?: RegExp; timeoutMs?: number } = {}
): Promise<{ subject: string; text: string }> {
  const { subject, timeoutMs = 30_000 } = options;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const match = (await search(to)).find(
      (message) => !subject || subject.test(message.Subject)
    );
    if (match) {
      const full = (await (
        await fetch(`${BASE}/api/v1/message/${match.ID}`)
      ).json()) as { Subject: string; Text: string };
      return { subject: full.Subject, text: full.Text };
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No email to ${to} arrived within ${timeoutMs} ms`);
}

export async function countEmails(to: string): Promise<number> {
  return (await search(to)).length;
}

/**
 * Watches Mailpit for `windowMs` and fails as soon as a message to `to` arrives, instead of a single
 * check right after some other signal (the in-app row landing, say) that only proves an *earlier* step
 * ran — the worker's email decision (`deliver()`) runs after that, so a lone immediate check can pass
 * even though a regression is about to enqueue mail. The window is polled throughout, not a blind sleep,
 * so a late arrival still fails the assertion; it's sized to the same worker fan-out latency this suite
 * already trusts elsewhere (`toPass({ timeout: 20_000 })` for the in-app notification itself, which lands
 * before any email would).
 */
export async function assertNoNewEmail(
  to: string,
  baseline: number,
  windowMs = 20_000
): Promise<void> {
  const deadline = Date.now() + windowMs;
  while (Date.now() < deadline) {
    const count = await countEmails(to);
    if (count !== baseline) {
      throw new Error(
        `Expected no new email to ${to} (baseline ${baseline}) but found ${count}`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

/** The first http(s) link in a plain-text email body. */
export function linkIn(text: string): string {
  const match = /https?:\/\/\S+/.exec(text);
  if (!match) throw new Error("No link found in the email");
  return match[0];
}
