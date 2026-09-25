import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

import { createTickLoader } from "@/infrastructure/role-ticks";

describe("createTickLoader (UI-15)", () => {
  let db: TestDatabase;

  const user = async (
    name: string,
    roles: string[],
    opts: { state?: "VERIFIED" | "PENDING"; badgeRole?: string } = {}
  ) => {
    const { id } = await db.prisma.user.create({
      data: {
        name,
        email: `${name}@example.test`,
        accountState: opts.state ?? "VERIFIED",
      },
    });
    await db.prisma.profile.create({
      data: { userId: id, fullName: name, badgeRole: opts.badgeRole ?? null },
    });
    for (const role of roles) {
      const { id: roleId } = await db.prisma.role.findUniqueOrThrow({
        where: { name: role },
      });
      await db.prisma.userRole.create({
        data: { userId: id, roleId, grantedBy: id },
      });
    }
    return id;
  };

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
  });
  afterEach(() => db.drop());

  it("loads each verified user's tick in one call, honouring the preference", async () => {
    const mod = await user("mod", ["ALUMNI", "MODERATOR"]);
    const chose = await user("chose", ["ALUMNI", "MODERATOR"], {
      badgeRole: "ALUMNI",
    });
    const revoked = await user("revoked", ["STUDENT"], { badgeRole: "ALUMNI" });
    const hidden = await user("hidden", ["FACULTY"], { badgeRole: "NONE" });
    const pending = await user("pending", ["STUDENT"], { state: "PENDING" });
    const bare = await user("bare", []);

    const ticks = await createTickLoader(db.prisma)([
      mod,
      chose,
      revoked,
      hidden,
      pending,
      bare,
    ]);

    expect(ticks.get(mod)?.role).toBe("MODERATOR");
    expect(ticks.get(chose)?.role).toBe("ALUMNI");
    expect(ticks.get(revoked)?.role).toBe("STUDENT");
    expect(ticks.has(hidden)).toBe(false);
    expect(ticks.has(pending)).toBe(false);
    expect(ticks.has(bare)).toBe(false);
  });

  it("returns an empty map for no ids", async () => {
    expect((await createTickLoader(db.prisma)([])).size).toBe(0);
  });
});
