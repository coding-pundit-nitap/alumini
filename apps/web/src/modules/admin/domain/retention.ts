import { z } from "zod";

/** One catalogue entry (12G G-2), injected from `@nitap/database/retention` by composition. */
export type RetentionRule = {
  defaultDays: number;
  minDays: number;
  maxDays: number;
  /** True when a sweep enforces this period today (XD-8: the rest show "not enforced yet"). */
  enforced: boolean;
};
export type RetentionCatalogue = Readonly<Record<string, RetentionRule>>;

/** What the settings page shows for one category. */
export type RetentionSettingView = RetentionRule & {
  id: string;
  category: string;
  retentionDays: number;
  approvedBy: string | null;
  updatedAt: Date;
  updatedBy: { id: string; name: string } | null;
};

/** 12G G-3: bounds come from the category's rule; a blank sign-off means "still a placeholder". */
export const retentionInputSchema = (rule: RetentionRule) =>
  z
    .object({
      retentionDays: z.coerce
        .number()
        .int("Whole days only.")
        .min(rule.minDays, `At least ${rule.minDays} days.`)
        .max(rule.maxDays, `At most ${rule.maxDays} days.`),
      approvedBy: z
        .string()
        .trim()
        .max(200, "At most 200 characters.")
        .nullish()
        .transform((v) => (v ? v : null)),
    })
    .strict();
export type RetentionInput = z.infer<ReturnType<typeof retentionInputSchema>>;
