import { PERMISSIONS } from "@nitap/database/permissions";

import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import type { FieldProblem } from "../domain/profile-items";
import type { Authorize } from "./authz";
import type { ItemCollection } from "./item-collection";

function fail(details: FieldProblem[]): never {
  throw new ValidationError({
    details: details.map((d) => ({
      field: d.field,
      code: "INVALID",
      message: d.message,
    })),
  });
}

/** Operations only ever take the caller's own id, and input types have no institutional fields. */
export function createCollectionUseCases<
  Input,
  Item extends { id: string },
>(deps: {
  collection: ItemCollection<Input, Item>;
  authorize: Authorize;
  /** A clock-dependent rule (e.g. "no future dates") that a static schema cannot express. Optional: skills and links have none. */
  clockProblems?: (input: Input, now: Date) => FieldProblem[];
  now: () => Date;
}) {
  function checked(input: Input): Input {
    const problems = deps.clockProblems?.(input, deps.now()) ?? [];
    if (problems.length > 0) fail(problems);
    return input;
  }

  return {
    async add(args: { actor: Actor | null; input: Input }): Promise<Item> {
      const caller = deps.authorize(args.actor, PERMISSIONS.PROFILE_UPDATE);
      const result = await deps.collection.add(
        caller.userId,
        checked(args.input)
      );
      if (result.ok) return result.item;
      if (result.reason === "LIMIT_REACHED") {
        throw new ConflictError("PROFILE_LIMIT_REACHED");
      }
      throw new ConflictError("PROFILE_ITEM_EXISTS");
    },

    async update(args: {
      actor: Actor | null;
      itemId: string;
      input: Input;
    }): Promise<Item> {
      const caller = deps.authorize(args.actor, PERMISSIONS.PROFILE_UPDATE);
      const result = await deps.collection.update(
        caller.userId,
        args.itemId,
        checked(args.input)
      );
      if (result.ok) return result.item;
      if (result.reason === "NOT_FOUND") throw new NotFoundError();
      throw new ConflictError("PROFILE_ITEM_EXISTS");
    },

    async remove(args: { actor: Actor | null; itemId: string }): Promise<void> {
      const caller = deps.authorize(args.actor, PERMISSIONS.PROFILE_UPDATE);
      const removed = await deps.collection.remove(caller.userId, args.itemId);
      if (!removed) throw new NotFoundError();
    },
  };
}

export type CollectionUseCases<Input, Item extends { id: string }> = ReturnType<
  typeof createCollectionUseCases<Input, Item>
>;
