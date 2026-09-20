import { AsyncLocalStorage } from "node:async_hooks";

export type RequestContext = {
  requestId: string;
  userId?: string;
};

const storage = new AsyncLocalStorage<RequestContext>();

/** Runs `fn` with `context` visible to every log line and error response produced inside it. */
export function runWithRequestContext<T>(
  context: RequestContext,
  fn: () => T
): T {
  return storage.run({ ...context }, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/** Called once the caller is authenticated so later log lines carry `user_id`. */
export function setRequestUser(userId: string): void {
  const context = storage.getStore();
  if (context) context.userId = userId;
}
