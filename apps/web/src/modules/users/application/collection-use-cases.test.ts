import { describe, expect, it, vi } from "vitest";

import {
  AuthenticationError,
  ConflictError,
  NotFoundError,
} from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { createCollectionUseCases } from "./collection-use-cases";
import type { ItemCollection } from "./item-collection";

type Item = { id: string; value: string };
type Input = { value: string };

const NOW = new Date("2026-09-21T10:00:00Z");
const actor = (accountState: Actor["accountState"] = "VERIFIED"): Actor => ({
  userId: "u1",
  accountState,
  requestId: "r",
  grants: [],
});
const allow = (a: Actor | null) => {
  if (!a) throw new AuthenticationError();
  return a;
};

function fakeCollection(): ItemCollection<Input, Item> & {
  items: Map<string, Item>;
} {
  const items = new Map<string, Item>();
  let seq = 0;
  return {
    items,
    async list(userId) {
      return [...items.values()].filter((i) => i.id.startsWith(`${userId}:`));
    },
    async add(userId, input) {
      if (items.size >= 2) return { ok: false, reason: "LIMIT_REACHED" };
      seq += 1;
      const item = { id: `${userId}:${seq}`, ...input };
      items.set(item.id, item);
      return { ok: true, item };
    },
    async update(userId, itemId, input) {
      const existing = items.get(itemId);
      if (!existing || !itemId.startsWith(`${userId}:`)) {
        return { ok: false, reason: "NOT_FOUND" };
      }
      const item = { ...existing, ...input };
      items.set(itemId, item);
      return { ok: true, item };
    },
    async remove(userId, itemId) {
      if (!itemId.startsWith(`${userId}:`)) return false;
      return items.delete(itemId);
    },
  };
}

describe("createCollectionUseCases", () => {
  it("adds an item for the caller", async () => {
    const collection = fakeCollection();
    const { add } = createCollectionUseCases({
      collection,
      authorize: allow,
      now: () => NOW,
    });
    const item = await add({ actor: actor(), input: { value: "a" } });
    expect(item).toEqual({ id: "u1:1", value: "a" });
  });

  it("maps LIMIT_REACHED to a 409 PROFILE_LIMIT_REACHED", async () => {
    const collection = fakeCollection();
    const { add } = createCollectionUseCases({
      collection,
      authorize: allow,
      now: () => NOW,
    });
    await add({ actor: actor(), input: { value: "a" } });
    await add({ actor: actor(), input: { value: "b" } });
    const error = await add({ actor: actor(), input: { value: "c" } }).catch(
      (e) => e
    );
    expect(error).toBeInstanceOf(ConflictError);
    expect(error.code).toBe("PROFILE_LIMIT_REACHED");
  });

  it("maps a DUPLICATE add to a 409 PROFILE_ITEM_EXISTS", async () => {
    const collection: ItemCollection<Input, Item> = {
      ...fakeCollection(),
      add: vi.fn(async () => ({ ok: false, reason: "DUPLICATE" }) as const),
    };
    const { add } = createCollectionUseCases({
      collection,
      authorize: allow,
      now: () => NOW,
    });
    const error = await add({ actor: actor(), input: { value: "a" } }).catch(
      (e) => e
    );
    expect(error).toBeInstanceOf(ConflictError);
    expect(error.code).toBe("PROFILE_ITEM_EXISTS");
  });

  it("updates only the caller's own item; another user's id is not-found", async () => {
    const collection = fakeCollection();
    const { add, update } = createCollectionUseCases({
      collection,
      authorize: allow,
      now: () => NOW,
    });
    await add({ actor: actor(), input: { value: "a" } });

    const updated = await update({
      actor: actor(),
      itemId: "u1:1",
      input: { value: "b" },
    });
    expect(updated).toEqual({ id: "u1:1", value: "b" });

    await expect(
      update({
        actor: { ...actor(), userId: "u2" },
        itemId: "u1:1",
        input: { value: "c" },
      })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("removes only the caller's own item; another user's id is not-found", async () => {
    const collection = fakeCollection();
    const { add, remove } = createCollectionUseCases({
      collection,
      authorize: allow,
      now: () => NOW,
    });
    await add({ actor: actor(), input: { value: "a" } });

    await expect(
      remove({ actor: { ...actor(), userId: "u2" }, itemId: "u1:1" })
    ).rejects.toBeInstanceOf(NotFoundError);

    await remove({ actor: actor(), itemId: "u1:1" });
    expect(collection.items.has("u1:1")).toBe(false);
  });

  it("runs the clock-dependent rule and reports it as a per-field validation error before the store is touched", async () => {
    const collection = fakeCollection();
    const { add } = createCollectionUseCases({
      collection,
      authorize: allow,
      clockProblems: () => [{ field: "value", message: "Not allowed." }],
      now: () => NOW,
    });
    const error = await add({ actor: actor(), input: { value: "a" } }).catch(
      (e) => e
    );
    expect(error.details).toEqual([
      { field: "value", code: "INVALID", message: "Not allowed." },
    ]);
    expect(collection.items.size).toBe(0);
  });

  it("allows a PENDING account (profile.update is state-allowed)", async () => {
    const collection = fakeCollection();
    const { add } = createCollectionUseCases({
      collection,
      authorize: allow,
      now: () => NOW,
    });
    await expect(
      add({ actor: actor("PENDING"), input: { value: "a" } })
    ).resolves.toBeDefined();
  });

  it("requires a session for every operation", async () => {
    const collection = fakeCollection();
    const { add, update, remove } = createCollectionUseCases({
      collection,
      authorize: allow,
      now: () => NOW,
    });
    await expect(
      add({ actor: null, input: { value: "a" } })
    ).rejects.toBeInstanceOf(AuthenticationError);
    await expect(
      update({ actor: null, itemId: "x", input: { value: "a" } })
    ).rejects.toBeInstanceOf(AuthenticationError);
    await expect(remove({ actor: null, itemId: "x" })).rejects.toBeInstanceOf(
      AuthenticationError
    );
  });
});
