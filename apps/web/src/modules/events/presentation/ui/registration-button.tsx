"use client";

import { Alert, AlertDescription } from "@nitap/ui/components/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@nitap/ui/components/alert-dialog";
import { Button } from "@nitap/ui/components/button";
import { Spinner } from "@nitap/ui/components/spinner";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { ActionResult } from "@/lib/action-result";

import type { EventDetail } from "../../application/event-queries";

type RegistrationAction = (
  eventId: string
) => Promise<ActionResult<{ registrationId: string }>>;

const HOLDS_A_SEAT = new Set(["REGISTERED", "ATTENDED", "NO_SHOW"]);

type ButtonState =
  | { mode: "none" }
  | { mode: "register" | "cancel"; disabledReason: string | null };

/**
 * Derives the button's mode and any disabled reason from `EventDetail`, mirroring the precedence of
 * `classifyRegistrationRefusal`/`decideCancelRegistration` (domain/event.ts). Display only: the server
 * remains authoritative and returns the real error on a race.
 */
function deriveState(event: EventDetail, now: Date): ButtonState {
  if (event.viewer.registrationState === "REGISTERED") {
    if (event.status === "CANCELLED") {
      return { mode: "cancel", disabledReason: "This event was cancelled." };
    }
    if (now >= event.startsAt) {
      return {
        mode: "cancel",
        disabledReason: "The event has already started.",
      };
    }
    return { mode: "cancel", disabledReason: null };
  }
  if (HOLDS_A_SEAT.has(event.viewer.registrationState ?? "")) {
    // ATTENDED / NO_SHOW: nothing left to do here.
    return { mode: "none" };
  }
  if (event.status === "CANCELLED") {
    return { mode: "register", disabledReason: "This event was cancelled." };
  }
  if (now >= event.registrationDeadline) {
    return { mode: "register", disabledReason: "Registration is closed." };
  }
  if (event.spotsRemaining <= 0) {
    return { mode: "register", disabledReason: "This event is full." };
  }
  return { mode: "register", disabledReason: null };
}

/** Register / cancel-registration button for the event detail page. */
export function RegistrationButton({
  event,
  registerAction,
  cancelAction,
}: {
  event: EventDetail;
  registerAction: RegistrationAction;
  cancelAction: RegistrationAction;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const state = deriveState(event, new Date());

  if (state.mode === "none") return null;

  const run = (action: RegistrationAction) => {
    setServerError(null);
    startTransition(async () => {
      const result = await action(event.id);
      if (result.ok) {
        router.refresh();
        return;
      }
      setServerError(result.error.message);
    });
  };

  return (
    <div className="flex flex-col gap-2">
      {state.mode === "register" ? (
        <Button
          type="button"
          className="rounded-full px-6 sm:self-start"
          disabled={pending || !!state.disabledReason}
          onClick={() => run(registerAction)}
        >
          {pending ? <Spinner data-icon="inline-start" /> : null}
          Register
        </Button>
      ) : (
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button
                type="button"
                variant="outline"
                className="rounded-full px-6 sm:self-start"
                disabled={pending || !!state.disabledReason}
              >
                {pending ? <Spinner data-icon="inline-start" /> : null}
                Cancel registration
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel your registration?</AlertDialogTitle>
              <AlertDialogDescription>
                You’ll give up your seat at {event.title}. You can register
                again later if spots remain.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep my spot</AlertDialogCancel>
              <AlertDialogAction onClick={() => run(cancelAction)}>
                Cancel registration
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      {state.disabledReason ? (
        <p className="text-muted-foreground text-sm">{state.disabledReason}</p>
      ) : null}
      {serverError ? (
        <Alert variant="destructive">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
