import { describe, expect, it, vi } from "vitest";

import type { Actor } from "@/modules/auth";

import { classifyViewer } from "./classify-viewer";

const actor = (over: Partial<Actor> = {}): Actor => ({
  userId: "viewer",
  accountState: "VERIFIED",
  requestId: "r",
  grants: [],
  ...over,
});

describe("classifyViewer", () => {
  it("classifies no actor as a guest", async () => {
    const classify = classifyViewer({
      connections: {
        async relation() {
          return "none";
        },
      },
      can: () => true,
    });
    expect(await classify(null, "owner")).toBe("guest");
  });

  it("classifies the profile's own owner as owner, even without profile.read", async () => {
    const classify = classifyViewer({
      connections: {
        async relation() {
          return "none";
        },
      },
      can: () => false,
    });
    expect(await classify(actor({ userId: "owner" }), "owner")).toBe("owner");
  });

  it("classifies a non-VERIFIED actor as unverified", async () => {
    const classify = classifyViewer({
      connections: {
        async relation() {
          return "none";
        },
      },
      can: () => true,
    });
    expect(await classify(actor({ accountState: "PENDING" }), "owner")).toBe(
      "unverified"
    );
  });

  it("classifies profile.read_any holders as privileged, without checking the connection", async () => {
    const relation = vi.fn(async () => "none" as const);
    const classify = classifyViewer({
      connections: { relation },
      can: (_a, permission) => permission === "profile.read_any",
    });
    expect(await classify(actor(), "owner")).toBe("privileged");
    expect(relation).not.toHaveBeenCalled();
  });

  it("classifies a blocked relation as blocked", async () => {
    const classify = classifyViewer({
      connections: {
        async relation() {
          return "blocked";
        },
      },
      can: (_a, permission) => permission === "profile.read",
    });
    expect(await classify(actor(), "owner")).toBe("blocked");
  });

  it("classifies a verified actor without profile.read as unverified", async () => {
    const classify = classifyViewer({
      connections: {
        async relation() {
          return "none";
        },
      },
      can: () => false,
    });
    expect(await classify(actor(), "owner")).toBe("unverified");
  });

  it("classifies a connected relation as connected, otherwise member", async () => {
    const classify = classifyViewer({
      connections: {
        async relation() {
          return "connected";
        },
      },
      can: (_a, permission) => permission === "profile.read",
    });
    expect(await classify(actor(), "owner")).toBe("connected");

    const classifyPlain = classifyViewer({
      connections: {
        async relation() {
          return "none";
        },
      },
      can: (_a, permission) => permission === "profile.read",
    });
    expect(await classifyPlain(actor(), "owner")).toBe("member");
  });

  it("fails closed (treated as member) and reports when the connection lookup throws", async () => {
    const reportError = vi.fn();
    const classify = classifyViewer({
      connections: {
        async relation() {
          throw new Error("db down");
        },
      },
      can: (_a, permission) => permission === "profile.read",
      reportError,
    });
    expect(await classify(actor(), "owner")).toBe("member");
    expect(reportError).toHaveBeenCalledOnce();
  });
});
