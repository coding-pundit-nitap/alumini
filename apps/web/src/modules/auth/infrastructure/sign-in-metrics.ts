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

/** Wraps the whole handler because Better Auth's rate limiter answers 429 before endpoint hooks run. */
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
