import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { config, proxy } from "./proxy";

const SESSION_COOKIE = "better-auth.session_token=signed-value";

const call = (headers: HeadersInit = {}, url = "http://localhost/alumni") =>
  proxy(
    new NextRequest(url, { headers: { cookie: SESSION_COOKIE, ...headers } })
  );

const callAnonymous = (url: string) => proxy(new NextRequest(url));

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

describe("proxy optimistic auth redirect (ADR-005 §2, TDS §7.5)", () => {
  it("redirects an anonymous request for a gated page to /login with a same-origin next", () => {
    const response = callAnonymous("http://localhost/alumni?q=a");
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/alumni?q=a");
  });

  it("still stamps the request id on the redirect", () => {
    const response = callAnonymous("http://localhost/alumni");
    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("passes a request that carries a session cookie (it is not validated here)", () => {
    const response = call();
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it.each([
    "http://localhost/",
    "http://localhost/login",
    "http://localhost/register",
    "http://localhost/health/live",
    "http://localhost/health/ready",
    "http://localhost/api/auth/sign-in/email",
    "http://localhost/api/v1/jobs",
  ])("never redirects the public path %s", (url) => {
    const response = callAnonymous(url);
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("does not turn a protocol-relative path into an open redirect", () => {
    const response = callAnonymous("http://localhost//evil.com/x");
    const location = new URL(response.headers.get("location")!);
    expect(location.origin).toBe("http://localhost");
    expect(location.searchParams.get("next")).toBe("/dashboard");
  });
});
