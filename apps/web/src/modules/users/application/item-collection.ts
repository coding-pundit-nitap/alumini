export type CollectionAddResult<Item> =
  | { ok: true; item: Item }
  | { ok: false; reason: "LIMIT_REACHED" | "DUPLICATE" };

export type CollectionUpdateResult<Item> =
  { ok: true; item: Item } | { ok: false; reason: "NOT_FOUND" | "DUPLICATE" };

/**
 * One member's list of one kind of item (experience, education, skills, links). `add` enforces its cap
 * under concurrency (a `SELECT … FOR UPDATE` on the owner's profile row, then count, then insert);
 * `update` and `remove` are scoped to `userId` by the store, so another member's item id is indistinguishable
 * from a missing one.
 */
export interface ItemCollection<Input, Item extends { id: string }> {
  list(userId: string): Promise<Item[]>;
  add(userId: string, input: Input): Promise<CollectionAddResult<Item>>;
  update(
    userId: string,
    itemId: string,
    input: Input
  ): Promise<CollectionUpdateResult<Item>>;
  remove(userId: string, itemId: string): Promise<boolean>;
}
