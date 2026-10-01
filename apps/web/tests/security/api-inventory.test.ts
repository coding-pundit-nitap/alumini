import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { API_INVENTORY, routesOnDisk } from "./api-inventory";

// Spec 16 SD-6: the inventory and the code cannot drift apart.

const appRoot = path.resolve(import.meta.dirname, "../../src/app");

describe("API inventory", () => {
  it("lists exactly the routes and methods that exist", () => {
    const declared = Object.fromEntries(
      Object.entries(API_INVENTORY).map(([url, methods]) => [
        url,
        Object.keys(methods).sort(),
      ])
    );
    expect(declared).toEqual(routesOnDisk(appRoot));
  });

  it("reads destructured exports such as Better Auth's", () => {
    expect(routesOnDisk(appRoot)["/api/auth/[...all]"]).toEqual([
      "GET",
      "POST",
    ]);
  });

  it("every mutating /api/v1 route checks the Origin, and monitoring routes check the token", () => {
    for (const [url, methods] of Object.entries(API_INVENTORY)) {
      const file = path.join(appRoot, url, "route.ts");
      const source = fs.readFileSync(file, "utf8");
      for (const entry of Object.values(methods)) {
        if (url.startsWith("/api/v1/") && entry.mutates) {
          expect(source, url).toContain("assertSameOrigin(request)");
        }
        if (entry.access.kind === "monitoring") {
          expect(source, url).toContain("healthDetailsVisible(request)");
        }
      }
    }
  });

  it("every session route resolves the caller through getActor", () => {
    for (const [url, methods] of Object.entries(API_INVENTORY)) {
      if (!Object.values(methods).some((e) => e.access.kind === "session"))
        continue;
      const source = fs.readFileSync(
        path.join(appRoot, url, "route.ts"),
        "utf8"
      );
      expect(source, url).toContain("getActor()");
    }
  });
});
