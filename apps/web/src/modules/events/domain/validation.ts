import { z } from "zod";

import { isValidTimeZone } from "./zoned-time";

/** Pure zod with no server imports, so client forms can use it. Clock-dependent checks are in `superRefine`. */
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

/** Presence and bounds only; `createEventInput` stays authoritative for date rules. */
export const eventFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(EVENT_TITLE_MIN, `Use at least ${EVENT_TITLE_MIN} characters.`)
      .max(EVENT_TITLE_MAX),
    description: z
      .string()
      .trim()
      .min(
        EVENT_DESCRIPTION_MIN,
        `Use at least ${EVENT_DESCRIPTION_MIN} characters.`
      )
      .max(EVENT_DESCRIPTION_MAX),
    startsLocal: z.string().min(1, "Choose when the event starts."),
    deadlineLocal: z.string().min(1, "Choose when registration closes."),
    timezone: z.string().min(1, "Choose a time zone."),
    isOnline: z.boolean(),
    location: z.string().trim().max(EVENT_LOCATION_MAX),
    capacity: z
      .number({ error: "Enter the number of seats." })
      .int()
      .min(EVENT_CAPACITY_MIN, `At least ${EVENT_CAPACITY_MIN} seat.`)
      .max(EVENT_CAPACITY_MAX, `At most ${EVENT_CAPACITY_MAX} seats.`),
  })
  .refine((value) => value.isOnline || value.location.trim().length > 0, {
    path: ["location"],
    message: "Add a location for an in-person event.",
    // Run even when other fields fail, so every missing field shows at once.
    when: ({ value }) =>
      typeof (value as { location?: unknown }).location === "string",
  });
export type EventFormValues = z.infer<typeof eventFormSchema>;
