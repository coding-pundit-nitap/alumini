/** What a Server Action returns to its form: expected outcomes are returned, not thrown. */
export type ActionError = {
  code: string;
  message: string;
  fields?: Record<string, string>;
};

export type ActionResult<T> =
  { ok: true; data: T } | { ok: false; error: ActionError; requestId: string };
