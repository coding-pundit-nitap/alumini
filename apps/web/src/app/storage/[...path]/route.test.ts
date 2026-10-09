import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, HEAD, POST } from "./route";

const upstream = vi.fn<typeof fetch>();
const ENV = { S3_ENDPOINT: "http://minio:9000/", S3_PUBLIC_PATH: "/storage" };

beforeEach(() => {
  upstream.mockReset();
  upstream.mockResolvedValue(new Response("ok", { status: 200 }));
  vi.stubGlobal("fetch", upstream);
  for (const [key, value] of Object.entries(ENV)) vi.stubEnv(key, value);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const sent = () => {
  const [url, init] = upstream.mock.calls[0]!;
  return { url: String(url), init: init!, headers: new Headers(init!.headers) };
};

describe("/storage proxy", () => {
  it("forwards to S3_ENDPOINT read at request time, keeping the encoded path and the signature", async () => {
    vi.stubEnv("S3_ENDPOINT", "http://store.internal:9000");
    await GET(
      new Request(
        "https://alumni.example/storage/alumini-uploads/a%20b.jpg?X-Amz-Signature=abc&X-Amz-Expires=60"
      )
    );
    expect(sent().url).toBe(
      "http://store.internal:9000/alumini-uploads/a%20b.jpg?X-Amz-Signature=abc&X-Amz-Expires=60"
    );
  });

  it("answers 404 without calling the store when the proxy is not configured", async () => {
    vi.stubEnv("S3_PUBLIC_PATH", "");
    const response = await GET(
      new Request("https://alumni.example/storage/b/k")
    );
    expect(response.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("never forwards the app's cookies or credentials to the store", async () => {
    await GET(
      new Request("https://alumni.example/storage/b/k", {
        headers: {
          cookie: "better-auth.session_token=secret",
          authorization: "Bearer x",
          range: "bytes=0-9",
        },
      })
    );
    const { headers } = sent();
    expect(headers.get("cookie")).toBeNull();
    expect(headers.get("authorization")).toBeNull();
    expect(headers.get("range")).toBe("bytes=0-9");
    expect(headers.get("accept-encoding")).toBe("identity");
  });

  it("streams an upload body through and passes the store's redirect back unfollowed", async () => {
    upstream.mockResolvedValue(
      new Response(null, { status: 303, headers: { location: "/done" } })
    );
    const response = await POST(
      new Request("https://alumni.example/storage/b", {
        method: "POST",
        headers: { "content-type": "multipart/form-data; boundary=x" },
        body: "--x--",
      })
    );
    const { init, headers } = sent();
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("manual");
    expect(headers.get("content-type")).toBe("multipart/form-data; boundary=x");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/done");
  });

  it("sends no body for HEAD and relays the store's status and headers", async () => {
    upstream.mockResolvedValue(
      new Response(null, {
        status: 206,
        headers: { "content-range": "bytes 0-9/100", "set-cookie": "x=y" },
      })
    );
    const response = await HEAD(
      new Request("https://alumni.example/storage/b/k", { method: "HEAD" })
    );
    expect(sent().init.body).toBeUndefined();
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 0-9/100");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("answers 502 when the store is unreachable", async () => {
    upstream.mockRejectedValue(new TypeError("fetch failed"));
    const response = await GET(
      new Request("https://alumni.example/storage/b/k")
    );
    expect(response.status).toBe(502);
  });
});
