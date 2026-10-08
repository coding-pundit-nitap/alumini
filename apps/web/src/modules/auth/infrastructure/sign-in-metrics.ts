import { getMetrics } from "@/infrastructure/observability";

export type SignInOutcome =
  | "success"
  | "invalid_credentials"
  | "forbidden"
  | "rate_limited"
  | "invalid_request"
  | "error";

const SIGN_IN_PATH = /\/sign-in\/email$/;

export function signInOutcome(status: number): SignInOutcome {
  if (status < 400) return "success";
  if (status === 401) return "invalid_credentials";
  if (status === 403) return "forbidden"; // email not verified, or a deactivated account
  if (status === 429) return "rate_limited";
  if (status < 500) return "invalid_request";
  return "error";
}

/**
 * Counts email sign-ins by outcome for the login-failure alert (R-9, spec 18C). Wraps the whole Better Auth
 * handler rather than an endpoint hook: the rate limiter answers 429 in Better Auth's router, before any
 * endpoint hook runs.
 */
export function withSignInMetrics(
  handler: (request: Request) => Promise<Response>
) {
  return async (request: Request): Promise<Response> => {
    const response = await handler(request);
    if (SIGN_IN_PATH.test(new URL(request.url).pathname))
      getMetrics().increment("auth_sign_in_total", {
        outcome: signInOutcome(response.status),
      });
    return response;
  };
}
