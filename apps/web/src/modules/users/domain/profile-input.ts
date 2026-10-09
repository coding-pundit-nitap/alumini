import { z } from "zod";

import {
  overridesNotLooser,
  VISIBILITY_LEVELS,
  type VisibilitySettings,
} from "./visibility";

// Cf (format: zero-width space, joiners, BOM) must go BEFORE whitespace is collapsed: JavaScript's \s
// matches U+FEFF, so collapsing first would turn a BOM into a space instead of removing it.
const FORMAT = /\p{Cf}/gu;
const CONTROL = /\p{Cc}/gu;

/** Plain text on one line: whitespace collapsed, control and zero-width characters removed. */
export function sanitiseSingleLine(value: string): string {
  return value
    .replace(FORMAT, "")
    .replace(/\s+/g, " ")
    .replace(CONTROL, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Plain text with line breaks: at most one blank line in a row, no other control characters. */
export function sanitiseMultiLine(value: string): string {
  return value
    .replace(FORMAT, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(CONTROL, (character) => (character === "\n" ? character : ""))
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Lengths are counted in UTF-16 units here and in characters by the database CHECK, so this can only be
// stricter than the database, never looser.
export const optionalText = (sanitise: (v: string) => string, max: number) =>
  z
    .string()
    .optional()
    .transform((value) => sanitise(value ?? "") || null)
    .pipe(z.string().max(max, `Use at most ${max} characters.`).nullable());

/** The only form fields the profile action reads (see `pickFields`). */
export const PROFILE_FIELDS = [
  "fullName",
  "headline",
  "bio",
  "location",
] as const;

/** Strict: institutional fields fail validation. */
export const updateProfileSchema = z
  .object({
    fullName: z
      .string("Enter your name.")
      .transform(sanitiseSingleLine)
      .pipe(
        z
          .string()
          .min(1, "Enter your name.")
          .max(100, "Use at most 100 characters.")
      ),
    headline: optionalText(sanitiseSingleLine, 120),
    bio: optionalText(sanitiseMultiLine, 2000),
    location: optionalText(sanitiseSingleLine, 100),
  })
  .strict();

export type ProfileCoreInput = z.output<typeof updateProfileSchema>;

export const PRIVACY_FIELDS = [
  "visibility",
  "contact",
  "location",
  "experience",
  "education",
] as const;

const override = z
  .enum(["INHERIT", ...VISIBILITY_LEVELS])
  .optional()
  .transform((value) =>
    value === undefined || value === "INHERIT" ? null : value
  );

export const updatePrivacySchema = z
  .object({
    visibility: z.enum(VISIBILITY_LEVELS, "Choose who can see your profile."),
    contact: override,
    location: override,
    experience: override,
    education: override,
  })
  .strict()
  .superRefine((value: VisibilitySettings, ctx) => {
    for (const section of overridesNotLooser(value)) {
      ctx.addIssue({
        code: "custom",
        path: [section],
        message: "Choose the same level as your profile, or a stricter one.",
      });
    }
  });

export type PrivacyInput = z.output<typeof updatePrivacySchema>;
