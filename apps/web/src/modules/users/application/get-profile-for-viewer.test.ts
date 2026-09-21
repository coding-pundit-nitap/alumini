import { describe, expect, it, vi } from "vitest";

import { NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { createFakeProfileStore } from "../../../../tests/support/fake-profile-store";
import type { ProfileRecord } from "../domain/profile";
import type { VisibilitySettings } from "../domain/visibility";
import type { Relation } from "./connection-lookup";
import { createGetProfileForViewer } from "./get-profile-for-viewer";

const settings = (
  over: Partial<VisibilitySettings> = {}
): VisibilitySettings => ({
  visibility: "MEMBERS_ONLY",
  contact: null,
  location: null,
  experience: null,
  education: null,
  ...over,
});
const owner = (over: Partial<ProfileRecord> = {}): ProfileRecord => ({
  userId: "owner",
  fullName: "Asha Rao",
  headline: "Engineer",
  bio: "About",
  location: "Tirupati",
  department: "CSE",
  degree: "B.Tech",
  graduationYear: 2019,
  settings: settings(),
  ...over,
});
const actor = (over: Partial<Actor> = {}): Actor => ({
  userId: "viewer",
  accountState: "VERIFIED",
  requestId: "r",
  grants: [],
  ...over,
});

function setup(
  opts: {
    record?: ProfileRecord;
    relation?: Relation | Error;
    permissions?: string[];
    audit?: { recordPrivilegedRead: ReturnType<typeof vi.fn> };
  } = {}
) {
  const { store } = createFakeProfileStore([opts.record ?? owner()]);
  const audit = opts.audit ?? { recordPrivilegedRead: vi.fn(async () => {}) };
  const reportError = vi.fn();
  const get = createGetProfileForViewer({
    store,
    connections: {
      async relation() {
        if (opts.relation instanceof Error) throw opts.relation;
        return opts.relation ?? "none";
      },
    },
    audit,
    can: (_actor, permission) =>
      (opts.permissions ?? ["profile.read"]).includes(permission),
    reportError,
  });
  return { get, audit, reportError };
}

describe("getProfileForViewer: who is looking", () => {
  it("a guest (no actor) sees the reduced view of a PUBLIC profile", async () => {
    const { get } = setup({
      record: owner({ settings: settings({ visibility: "PUBLIC" }) }),
    });
    const view = await get({ actor: null, targetUserId: "owner" });
    expect(view.fullName).toBe("Asha Rao");
    expect("bio" in view).toBe(false);
  });

  it("a guest gets not-found for a MEMBERS_ONLY profile", async () => {
    const { get } = setup();
    await expect(
      get({ actor: null, targetUserId: "owner" })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("the owner always sees their own profile, even PRIVATE and even while PENDING", async () => {
    const { get } = setup({
      record: owner({ settings: settings({ visibility: "PRIVATE" }) }),
    });
    const view = await get({
      actor: actor({ userId: "owner", accountState: "PENDING" }),
      targetUserId: "owner",
    });
    expect(view.bio).toBe("About");
  });

  it("a verified member sees a MEMBERS_ONLY profile in full", async () => {
    const { get } = setup();
    expect((await get({ actor: actor(), targetUserId: "owner" })).bio).toBe(
      "About"
    );
  });

  it("an unverified account is treated like a guest", async () => {
    const { get } = setup();
    await expect(
      get({ actor: actor({ accountState: "PENDING" }), targetUserId: "owner" })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("a verified account without profile.read is treated like a guest", async () => {
    const { get } = setup({ permissions: [] });
    await expect(
      get({ actor: actor(), targetUserId: "owner" })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("a blocked viewer gets not-found even for a PUBLIC profile", async () => {
    const { get } = setup({
      relation: "blocked",
      record: owner({ settings: settings({ visibility: "PUBLIC" }) }),
    });
    await expect(
      get({ actor: actor(), targetUserId: "owner" })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("a connected viewer sees a CONNECTIONS_ONLY profile; a plain member does not", async () => {
    const record = owner({
      settings: settings({ visibility: "CONNECTIONS_ONLY" }),
    });
    await expect(
      setup({ record, relation: "connected" }).get({
        actor: actor(),
        targetUserId: "owner",
      })
    ).resolves.toBeDefined();
    await expect(
      setup({ record, relation: "none" }).get({
        actor: actor(),
        targetUserId: "owner",
      })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("fails closed when the connection lookup fails: treated as a plain member, and reported", async () => {
    const record = owner({
      settings: settings({ visibility: "CONNECTIONS_ONLY" }),
    });
    const { get, reportError } = setup({
      record,
      relation: new Error("db down"),
    });
    await expect(
      get({ actor: actor(), targetUserId: "owner" })
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(reportError).toHaveBeenCalledOnce();
  });

  it("not-found for an unknown user", async () => {
    const { get } = setup();
    await expect(
      get({ actor: actor(), targetUserId: "missing" })
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("getProfileForViewer: privileged reads (RBAC §12)", () => {
  const privileged = { permissions: ["profile.read", "profile.read_any"] };

  it("shows a PRIVATE profile and audits the read", async () => {
    const { get, audit } = setup({
      ...privileged,
      record: owner({ settings: settings({ visibility: "PRIVATE" }) }),
    });
    const view = await get({ actor: actor(), targetUserId: "owner" });
    expect(view.bio).toBe("About");
    expect(audit.recordPrivilegedRead).toHaveBeenCalledWith({
      actorId: "viewer",
      targetUserId: "owner",
    });
  });

  it("refuses the read when the audit row cannot be written", async () => {
    const audit = {
      recordPrivilegedRead: vi.fn(async () => {
        throw new Error("audit down");
      }),
    };
    const { get } = setup({ ...privileged, audit });
    await expect(
      get({ actor: actor(), targetUserId: "owner" })
    ).rejects.toThrow("audit down");
  });

  it("does not audit ordinary reads", async () => {
    const { get, audit } = setup();
    await get({ actor: actor(), targetUserId: "owner" });
    expect(audit.recordPrivilegedRead).not.toHaveBeenCalled();
  });
});
