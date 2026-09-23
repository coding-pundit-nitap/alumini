import { z } from "zod";

import { isValidTimeZone } from "./zoned-time";

/**
 * The `POST /events` request shape (spec E-9), pure zod: no `@/lib/errors`, so a client-side
 * react-hook-form form can import this directly. `superRefine` carries the checks that need a
 * clock (future dates, deadline ordering) or the stdlib zone check; issues land on the offending
 * field path so the UI can show them per field.
 */
export const EVENT_TITLE_MIN = 3;
export const EVENT_TITLE_MAX = 150;
export const EVENT_DESCRIPTION_MIN = 10;
export const EVENT_DESCRIPTION_MAX = 10_000;
export const EVENT_LOCATION_MAX = 200;
export const EVENT_CAPACITY_MIN = 1;
export const EVENT_CAPACITY_MAX = 100_000;

const isoDateTime = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value));

export function makeCreateEventInput(now: () => Date) {
  return z
    .object({
      title: z.string().trim().min(EVENT_TITLE_MIN).max(EVENT_TITLE_MAX),
      description: z
        .string()
        .trim()
        .min(EVENT_DESCRIPTION_MIN)
        .max(EVENT_DESCRIPTION_MAX),
      startsAt: isoDateTime,
      timezone: z.string().trim().min(1),
      location: z
        .string()
        .trim()
        .max(EVENT_LOCATION_MAX)
        .nullable()
        .optional()
        .transform((value) => (value ? value : null)),
      isOnline: z.boolean(),
      capacity: z.int().min(EVENT_CAPACITY_MIN).max(EVENT_CAPACITY_MAX),
      registrationDeadline: isoDateTime,
    })
    .strict()
    .superRefine((value, ctx) => {
      const clock = now();
      if (value.startsAt <= clock) {
        ctx.addIssue({
          code: "custom",
          path: ["startsAt"],
          message: "startsAt must be in the future.",
        });
      }
      if (value.registrationDeadline <= clock) {
        ctx.addIssue({
          code: "custom",
          path: ["registrationDeadline"],
          message: "registrationDeadline must be in the future.",
        });
      }
      if (value.registrationDeadline > value.startsAt) {
        ctx.addIssue({
          code: "custom",
          path: ["registrationDeadline"],
          message: "registrationDeadline must be at or before startsAt.",
        });
      }
      if (!value.isOnline && !value.location) {
        ctx.addIssue({
          code: "custom",
          path: ["location"],
          message: "location is required for in-person events.",
        });
      }
      if (!isValidTimeZone(value.timezone)) {
        ctx.addIssue({
          code: "custom",
          path: ["timezone"],
          message: "timezone is not a valid IANA zone.",
        });
      }
    });
}

export const createEventInput = makeCreateEventInput(() => new Date());
export type CreateEventInput = z.infer<typeof createEventInput>;
