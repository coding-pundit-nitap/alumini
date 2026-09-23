"use server";

import { runAction } from "@/app/_actions/run-action";
import {
  cancelRegistration,
  createEvent,
  registerForEvent,
} from "@/composition/events";
import type { ActionResult } from "@/lib/action-result";
import { ValidationError, type ValidationDetail } from "@/lib/errors";
import { getActor } from "@/modules/auth";
import {
  isValidTimeZone,
  zonedWallTimeToUtc,
  type EventFormValues,
} from "@/modules/events";

/**
 * Creates an event from the `/events/new` form (FR-EVENT-001). The form sends wall times plus a zone;
 * they become UTC instants here, and `createEvent` validates the rest. The client navigates to the
 * returned id (no action here redirects: `redirect()` throws, and `runAction` would catch it).
 */
export async function createEventAction(
  form: EventFormValues
): Promise<ActionResult<{ eventId: string }>> {
  return runAction(async () => {
    const details: ValidationDetail[] = [];
    const toUtc = (field: string, wall: string) => {
      try {
        return zonedWallTimeToUtc(wall, form.timezone).toISOString();
      } catch {
        details.push({
          field,
          code: "INVALID",
          message: "Enter a valid date and time.",
        });
        return null;
      }
    };

    let startsAt = null;
    let registrationDeadline = null;
    if (!isValidTimeZone(form.timezone)) {
      details.push({
        field: "timezone",
        code: "INVALID",
        message: "Choose a valid time zone.",
      });
    } else {
      startsAt = toUtc("startsLocal", form.startsLocal);
      registrationDeadline = toUtc("deadlineLocal", form.deadlineLocal);
    }
    if (details.length) throw new ValidationError({ details });

    return createEvent({
      actor: await getActor(),
      input: {
        title: form.title,
        description: form.description,
        startsAt,
        registrationDeadline,
        timezone: form.timezone,
        isOnline: form.isOnline,
        location: form.location || null,
        capacity: form.capacity,
      },
    });
  });
}

/** Registers the caller for an event from the detail page (FR-EVENT-005). */
export async function registerForEventAction(
  eventId: string
): Promise<ActionResult<{ registrationId: string }>> {
  return runAction(async () =>
    registerForEvent({ actor: await getActor(), eventId })
  );
}

/** Cancels the caller's own registration from the detail page (FR-EVENT-006). */
export async function cancelRegistrationAction(
  eventId: string
): Promise<ActionResult<{ registrationId: string }>> {
  return runAction(async () =>
    cancelRegistration({ actor: await getActor(), eventId })
  );
}
