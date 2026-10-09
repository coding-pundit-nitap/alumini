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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nitap/ui/components/select";
import { Spinner } from "@nitap/ui/components/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@nitap/ui/components/table";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { ActionResult } from "@/lib/action-result";

import type { EventDetail, Registrant } from "../../application/event-queries";

type CancelAction = (
  eventId: string
) => Promise<ActionResult<{ eventId: string }>>;
type MarkAttendanceAction = (
  eventId: string,
  registrationId: string,
  state: "ATTENDED" | "NO_SHOW"
) => Promise<ActionResult<{ registrationId: string }>>;

const MARKABLE = new Set<Registrant["state"]>([
  "REGISTERED",
  "ATTENDED",
  "NO_SHOW",
]);

/**
 * Cancel and attendance controls. Confirmed and non-optimistic; the server is
 * authoritative.
 */
export function OrganizerPanel({
  event,
  registrants,
  cancelEventAction,
  markAttendanceAction,
}: {
  event: EventDetail;
  registrants: Registrant[];
  cancelEventAction: CancelAction;
  markAttendanceAction: MarkAttendanceAction;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [rowPending, setRowPending] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{
    id: string;
    message: string;
  } | null>(null);

  const [now] = useState(() => new Date());
  const started = now >= event.startsAt;
  const cancelled = event.status === "CANCELLED";

  const runCancel = () => {
    setCancelError(null);
    startTransition(async () => {
      const result = await cancelEventAction(event.id);
      if (result.ok) {
        router.refresh();
        return;
      }
      setCancelError(result.error.message);
    });
  };

  const runMark = (registrationId: string, state: "ATTENDED" | "NO_SHOW") => {
    setRowError(null);
    setRowPending(registrationId);
    startTransition(async () => {
      const result = await markAttendanceAction(
        event.id,
        registrationId,
        state
      );
      setRowPending(null);
      if (result.ok) {
        router.refresh();
        return;
      }
      setRowError({ id: registrationId, message: result.error.message });
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold tracking-tight">Organizer tools</h2>
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="rounded-full"
                disabled={pending || cancelled}
              >
                {pending ? <Spinner data-icon="inline-start" /> : null}
                Cancel event
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel this event?</AlertDialogTitle>
              <AlertDialogDescription>
                Registrants will see {event.title} as cancelled. This cannot be
                undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep event</AlertDialogCancel>
              <AlertDialogAction onClick={runCancel}>
                Cancel event
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {cancelError ? (
        <Alert variant="destructive">
          <AlertDescription>{cancelError}</AlertDescription>
        </Alert>
      ) : null}

      {!started ? (
        <p className="text-muted-foreground text-sm">
          Attendance can be marked once the event starts.
        </p>
      ) : null}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Attendance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {registrants.map((registrant) => (
            <TableRow key={registrant.registrationId}>
              <TableCell>{registrant.name}</TableCell>
              <TableCell>{registrant.state}</TableCell>
              <TableCell>
                {MARKABLE.has(registrant.state) ? (
                  <div className="flex flex-col gap-1">
                    <Select
                      items={[
                        { label: "Attended", value: "ATTENDED" },
                        { label: "No-show", value: "NO_SHOW" },
                      ]}
                      value={
                        registrant.state === "REGISTERED"
                          ? undefined
                          : registrant.state
                      }
                      onValueChange={(value) => {
                        if (value === "ATTENDED" || value === "NO_SHOW") {
                          runMark(registrant.registrationId, value);
                        }
                      }}
                      disabled={
                        !started || rowPending === registrant.registrationId
                      }
                    >
                      <SelectTrigger
                        className="w-40"
                        aria-label={`Mark attendance for ${registrant.name}`}
                      >
                        <SelectValue placeholder="Mark attendance" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="ATTENDED">Attended</SelectItem>
                          <SelectItem value="NO_SHOW">No-show</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {rowError?.id === registrant.registrationId ? (
                      <p className="text-destructive text-sm">
                        {rowError.message}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
