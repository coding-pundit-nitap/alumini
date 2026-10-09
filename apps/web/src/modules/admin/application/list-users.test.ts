import { describe, expect, it, vi } from "vitest";

import { AuthorizationError, ValidationError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import type { AdminStore, UserRow } from "./admin-store";
import { createListUsers } from "./list-users";

const actor = {
  userId: "a",
  accountState: "VERIFIED",
  requestId: "r",
  grants: [],
} as Actor;
const row = (i: number): UserRow => ({
  id: `00000000-0000-4000-8000-00000000000${i}`,
  name: `U${i}`,
  email: `u${i}@x.test`,
  accountState: "VERIFIED",
  roles: [],
  createdAt: new Date(2026, 0, 10 - i),
});
const storeWith = (rows: UserRow[]) =>
  ({ listUsers: vi.fn(async () => rows) }) as unknown as AdminStore & {
    listUsers: ReturnType<typeof vi.fn>;
  };

describe("listUsers", () => {
  it("authorizes user.read_admin, concealed", async () => {
    const authorize = vi.fn(() => actor);
    await createListUsers({ store: storeWith([]), authorize })({
      actor,
      query: {},
    });
    expect(authorize).toHaveBeenCalledWith(actor, "user.read_admin", {
      concealed: true,
    });
  });
  it("does not reach the store when denied", async () => {
    const store = storeWith([]);
    const authorize = () => {
      throw new AuthorizationError({ hideExistence: true });
    };
    await expect(
      createListUsers({ store, authorize })({ actor, query: {} })
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(store.listUsers).not.toHaveBeenCalled();
  });
  it("fetches limit+1 and returns a cursor only when there is more", async () => {
    const store = storeWith([row(1), row(2), row(3)]);
    const page = await createListUsers({ store, authorize: () => actor })({
      actor,
      query: { limit: "2" },
    });
    expect(store.listUsers).toHaveBeenCalledWith(
      expect.objectContaining({ take: 3 })
    );
    expect(page.data).toHaveLength(2);
    expect(page.nextCursor).toEqual(expect.any(String));
  });
  it("rejects a bad filter and a tampered cursor", async () => {
    const list = createListUsers({
      store: storeWith([]),
      authorize: () => actor,
    });
    await expect(
      list({ actor, query: { state: "HAPPY" } })
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      list({ actor, query: { cursor: "junk" } })
    ).rejects.toMatchObject({ code: "INVALID_CURSOR" });
  });
});
