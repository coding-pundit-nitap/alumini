import { PERMISSIONS } from "@nitap/database/permissions";
import { z } from "zod";

import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import {
  decideTransition,
  type MentorshipAction,
  type MentorshipState,
} from "../domain/mentorship";
import type { Authorize } from "./authz";
import type {
  MentorshipObserver,
  MentorshipOutcome,
  MentorshipStore,
} from "./mentorship-store";
import { refuse } from "./refusal";
import { parse } from "./validation";

const note = z.string().trim().min(1).max(500).optional();

const OUTCOME: Record<MentorshipAction, MentorshipOutcome> = {
  accept: "accepted",
  decline: "declined",
  cancel: "cancelled",
  start: "started",
  complete: "completed",
};

/**
 * The domain table decides and a guarded update makes it stick. Accept locks the mentor's profile so
 * concurrent accepts cannot exceed `max_mentees`.
 */
export function createTransitionMentorship(deps: {
  store: MentorshipStore;
  authorize: Authorize;
  observe?: MentorshipObserver;
  now?: () => Date;
}) {
  const now = deps.now ?? (() => new Date());

  return async function transitionMentorship(args: {
    actor: Actor | null;
    mentorshipId: string;
    action: MentorshipAction;
    note?: unknown;
  }): Promise<{ state: MentorshipState }> {
    // Mentor moves need the mentor permission up front; cancel is open to both sides, so authenticate now
    // and check the side's own permission once the row says which side the caller is.
    const caller = deps.authorize(
      args.actor,
      args.action === "cancel"
        ? PERMISSIONS.MENTOR_SEARCH
        : PERMISSIONS.MENTORSHIP_RESPOND
    );
    const parsedNote = parse(note, args.note);
    if (parsedNote !== undefined && args.action !== "decline") {
      // A note only means something on a decline; silently dropping it would hide a client bug.
      throw new ValidationError({
        details: [
          {
            field: "note",
            code: "INVALID",
            message: "A note is only accepted when declining.",
          },
        ],
      });
    }

    const to = await deps.store.transaction(async (tx) => {
      const row = await tx.findById(args.mentorshipId);
      if (!row) throw new NotFoundError();

      const blocked =
        args.action === "cancel"
          ? false
          : await tx.blocked(row.mentorId, row.menteeId);
      const capacity =
        args.action === "accept"
          ? await tx.lockMentorCapacity(row.mentorId)
          : null;

      const decision = decideTransition(
        row,
        caller.userId,
        { action: args.action, note: parsedNote },
        { blocked, capacity },
        now()
      );
      if (!decision.ok) refuse(decision);

      if (args.action === "cancel") {
        deps.authorize(
          args.actor,
          caller.userId === row.mentorId
            ? PERMISSIONS.MENTORSHIP_RESPOND
            : PERMISSIONS.MENTORSHIP_REQUEST
        );
      }

      const updated = await tx.update(row.id, row.state, decision.patch);
      if (!updated) throw new ConflictError("INVALID_STATE_TRANSITION");

      await tx.enqueue({
        type: decision.event,
        payload: {
          v: 1,
          mentorshipId: row.id,
          mentorId: row.mentorId,
          menteeId: row.menteeId,
          actorId: caller.userId,
        },
      });
      return decision.to;
    });
    deps.observe?.(OUTCOME[args.action], args.mentorshipId);
    return { state: to };
  };
}
export type TransitionMentorship = ReturnType<
  typeof createTransitionMentorship
>;
