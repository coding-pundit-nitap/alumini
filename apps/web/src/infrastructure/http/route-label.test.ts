import { describe, expect, it } from "vitest";

import { routeLabel } from "./route-label";

describe("routeLabel (spec 13A A-8)", () => {
  it("replaces id-like segments with :id", () => {
    expect(
      routeLabel("/api/v1/posts/3f2b8c1e-9a4d-4e2b-8c1a-0d9e8f7a6b5c", 200)
    ).toBe("/api/v1/posts/:id");
    expect(
      routeLabel(
        "/api/v1/admin/users/aBcDeFgHiJkLmNoPqRsTuV12/roles/ALUMNI",
        200
      )
    ).toBe("/api/v1/admin/users/:id/roles/ALUMNI");
    expect(routeLabel("/api/v1/events/42/registrations/7", 201)).toBe(
      "/api/v1/events/:id/registrations/:id"
    );
  });

  it("keeps static paths", () => {
    expect(routeLabel("/api/v1/notifications", 200)).toBe(
      "/api/v1/notifications"
    );
    expect(routeLabel("/health/ready", 503)).toBe("/health/ready");
  });

  it("collapses 400, 404 and 405 to 'unmatched' so junk segments cannot mint labels", () => {
    expect(routeLabel("/api/v1/posts/not-a-real-id", 404)).toBe("unmatched");
    expect(routeLabel("/api/v1/posts/zzz", 400)).toBe("unmatched");
    expect(routeLabel("/api/v1/posts", 405)).toBe("unmatched");
  });
});
