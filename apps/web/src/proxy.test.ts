import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { config, proxy } from "./proxy";

const call = (headers: HeadersInit = {}) =>
  proxy(new NextRequest("http://localhost/alumni", { headers }));

describe("proxy (reliability §6.2)", () => {
  it("generates a request id, forwards it to the app and echoes it to the client", () => {
    const response = call();
    const id = response.headers.get("x-request-id");
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    // NextResponse.next({ request }) forwards overridden request headers under this prefix.
    expect(response.headers.get("x-middleware-request-x-request-id")).toBe(id);
  });

  it("accepts a well-formed request id from the proxy in front of us", () => {
    const response = call({ "x-request-id": "nginx-1234abcd" });
    expect(response.headers.get("x-request-id")).toBe("nginx-1234abcd");
    expect(response.headers.get("x-middleware-request-x-request-id")).toBe(
      "nginx-1234abcd"
    );
  });

  it("replaces a malformed one so a client cannot inject text into logs", () => {
    const response = call({ "x-request-id": "<script>alert(1)</script>" });
    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("skips static assets", () => {
    const [matcher] = config.matcher;
    const re = new RegExp(`^${matcher}$`);
    expect(re.test("/alumni")).toBe(true);
    expect(re.test("/api/v1/jobs")).toBe(true);
    expect(re.test("/health/live")).toBe(true);
    expect(re.test("/_next/static/chunk.js")).toBe(false);
    expect(re.test("/_next/image")).toBe(false);
    expect(re.test("/favicon.ico")).toBe(false);
  });
});
