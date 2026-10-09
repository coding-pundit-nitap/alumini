import { z } from "zod";

export const CONTACT_METHODS = [
  "IN_APP",
  "EMAIL",
  "VIDEO_CALL",
  "PHONE",
] as const;

export const MENTOR_LIMITS = {
  expertise: 1000,
  availability: 200,
  topics: 10,
  topic: 40,
  maxMentees: 20,
} as const;

const topic = z
  .string()
  .trim()
  .min(1)
  .max(MENTOR_LIMITS.topic)
  .transform((value) => value.toLowerCase());

/** `accepting: false` pauses the offer. The contact method is a preference, not a contact detail. */
export const mentorProfileInput = z
  .object({
    expertise: z.string().trim().min(1).max(MENTOR_LIMITS.expertise),
    topics: z
      .array(topic)
      .max(MENTOR_LIMITS.topics)
      .default([])
      .transform((list) => [...new Set(list)]),
    availability: z.string().trim().max(MENTOR_LIMITS.availability).default(""),
    preferredContactMethod: z.enum(CONTACT_METHODS).default("IN_APP"),
    maxMentees: z
      .number()
      .int()
      .min(1)
      .max(MENTOR_LIMITS.maxMentees)
      .default(3),
    accepting: z.boolean().default(true),
  })
  .strict();

export type MentorProfileInput = z.output<typeof mentorProfileInput>;
