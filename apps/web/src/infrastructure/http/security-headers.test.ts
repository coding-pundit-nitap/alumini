import { describe, expect, it } from "vitest";

import {
  buildPageCsp,
  createNonce,
  isNonPagePath,
  staticSecurityHeaders,
  storageOriginFor,
} from "./security-headers";

const directives = (csp: string) =>
  new Map(
    csp.split("; ").map((d) => {
      const [name, ...values] = d.split(" ");
      return [name, values] as const;
    })
  );

describe("page CSP (strategy §10.1 Headers, spec 16 SD-1/SD-2)", () => {
  it("allows scripts only by this response's nonce, never inline or eval in production", () => {
    const csp = directives(buildPageCsp({ nonce: "abc", dev: false }));
    expect(csp.get("script-src")).toEqual([
      "'self'",
      "'nonce-abc'",
      "'strict-dynamic'",
    ]);
    expect(csp.get("object-src")).toEqual(["'none'"]);
    expect(csp.get("base-uri")).toEqual(["'self'"]);
    expect(csp.get("form-action")).toEqual(["'self'"]);
    expect(csp.get("frame-ancestors")).toEqual(["'none'"]);
    expect(csp.has("upgrade-insecure-requests")).toBe(true);
  });

  it("adds unsafe-eval under next dev only, and does not upgrade plain-http dev requests", () => {
    const csp = directives(buildPageCsp({ nonce: "abc", dev: true }));
    expect(csp.get("script-src")).toContain("'unsafe-eval'");
    expect(csp.has("upgrade-insecure-requests")).toBe(false);
  });

  it("lets the browser reach the object store only when it is a separate origin", () => {
    const own = directives(buildPageCsp({ nonce: "n", dev: false }));
    expect(own.get("connect-src")).toEqual(["'self'"]);

    const direct = directives(
      buildPageCsp({
        nonce: "n",
        dev: false,
        storageOrigin: "http://localhost:9000",
      })
    );
    expect(direct.get("connect-src")).toEqual([
      "'self'",
      "http://localhost:9000",
    ]);
    expect(direct.get("img-src")).toContain("http://localhost:9000");
  });
});

describe("storageOriginFor", () => {
  const base = { S3_ENDPOINT: "https://s3.example.test", S3_BUCKET: "up" };

  it("is none when S3_PUBLIC_PATH proxies storage through this origin", () => {
    expect(storageOriginFor({ ...base, S3_PUBLIC_PATH: "/storage" })).toBe(
      null
    );
  });

  it("is the endpoint for path-style, the bucket subdomain otherwise", () => {
    expect(storageOriginFor({ ...base, S3_FORCE_PATH_STYLE: "true" })).toBe(
      "https://s3.example.test"
    );
    expect(storageOriginFor(base)).toBe("https://up.s3.example.test");
  });

  it("is none for a missing or malformed endpoint", () => {
    expect(storageOriginFor({})).toBe(null);
    expect(storageOriginFor({ S3_ENDPOINT: "not a url" })).toBe(null);
  });
});

describe("nonces", () => {
  it("are 128 random bits and never repeat", () => {
    const seen = new Set(Array.from({ length: 1000 }, createNonce));
    expect(seen.size).toBe(1000);
    for (const nonce of seen) {
      expect(Buffer.from(nonce, "base64")).toHaveLength(16);
    }
  });
});

describe("static headers (SD-3)", () => {
  const names = (production: boolean) =>
    staticSecurityHeaders({ production }).map((h) => h.key);

  it("always send nosniff, referrer, permissions, frame and opener policies", () => {
    expect(names(false)).toEqual([
      "X-Content-Type-Options",
      "Referrer-Policy",
      "Permissions-Policy",
      "X-Frame-Options",
      "Cross-Origin-Opener-Policy",
    ]);
  });

  it("add HSTS in production only (NFR-SEC-003)", () => {
    expect(names(false)).not.toContain("Strict-Transport-Security");
    expect(names(true)).toContain("Strict-Transport-Security");
  });
});

describe("isNonPagePath", () => {
  it.each(["/api/v1/jobs", "/api/auth/sign-in", "/health/live", "/metrics"])(
    "%s is data",
    (path) => expect(isNonPagePath(path)).toBe(true)
  );
  it.each(["/", "/apiary", "/healthy-habits", "/jobs", "/metrics-guide"])(
    "%s is a page",
    (path) => expect(isNonPagePath(path)).toBe(false)
  );
});
