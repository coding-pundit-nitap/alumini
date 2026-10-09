export type CollectionAddResult<Item> =
  | { ok: true; item: Item }
  | { ok: false; reason: "LIMIT_REACHED" | "DUPLICATE" };

export type CollectionUpdateResult<Item> =
  { ok: true; item: Item } | { ok: false; reason: "NOT_FOUND" | "DUPLICATE" };

/**
 * `add` locks the owner's profile to enforce its cap. `update` and `remove` are scoped to the owner,
 * so another member's id reads as missing.
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
