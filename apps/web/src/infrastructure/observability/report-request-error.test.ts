import { describe, it, expect, vi } from "vitest";
import { logger } from "./index";
import { getRequestContext } from "@nitap/observability";
import { reportRequestError } from "./report-request-error";

const context = {
  routerKind: "App Router",
  routePath: "/app/alumni/[id]",
  routeType: "render",
  renderSource: "react-server-components",
  revalidateReason: undefined,
  renderType: "dynamic",
} as const;

describe("reportRequestError (TDS §16.4 rule 6)", () => {
  it("logs the failure once at error level with digest, route and request id", async () => {
    let seenRequestId: string | undefined;
    const error = vi.spyOn(logger, "error").mockImplementation(() => {
      seenRequestId = getRequestContext()?.requestId;
    });
    const failure = Object.assign(new Error("render blew up"), {
      digest: "1234567",
    });

    await reportRequestError(
      failure,
      {
        path: "/alumni/42?token=secret",
        method: "GET",
        headers: { "x-request-id": "abcd-1234-efgh" },
      },
      context
    );

    expect(error).toHaveBeenCalledTimes(1);
    const [event, data] = error.mock.calls[0] ?? [];
    expect(event).toBe("http.request.unhandled_error");
    expect(data?.error).toBe(failure);
    expect(data?.metadata).toEqual({
      digest: "1234567",
      method: "GET",
      path: "/alumni/42",
      routePath: "/app/alumni/[id]",
      routeType: "render",
    });
    expect(JSON.stringify(data)).not.toContain("secret");
    expect(seenRequestId).toBe("abcd-1234-efgh");
  });

  it("copes with a missing or malformed request id and non-Error values", async () => {
    const error = vi.spyOn(logger, "error").mockImplementation(() => {});
    await reportRequestError(
      "a string was thrown",
      { path: "/", method: "POST", headers: { "x-request-id": ["a", "b"] } },
      context
    );
    expect(error).toHaveBeenCalledTimes(1);
  });
});
