import { z } from "zod";

import { EMPLOYMENT_TYPES, WORK_MODES } from "./job";

/** Https-only, belt-and-braces with the DB's ck_job_application_url. */
const applicationUrl = z
  .string()
  .trim()
  .url()
  .regex(/^https:\/\//, "The application link must start with https://");

/** Trim, lower-case, de-dupe, cap at 20. */
const skills = z
  .array(z.string().trim().min(1).max(40))
  .max(20)
  .transform((values) => [...new Set(values.map((v) => v.toLowerCase()))]);

const jobFields = {
  title: z.string().trim().min(1).max(200),
  company: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(5000),
  employmentType: z.enum(EMPLOYMENT_TYPES),
  location: z.string().trim().min(1).max(200),
  workMode: z.enum(WORK_MODES),
  experience: z.string().trim().min(1).max(200),
  skills,
  applicationUrl,
  deadline: z.coerce.date(),
};

export const createJobInput = z.object(jobFields).strict();
export const editJobInput = z.object(jobFields).strict();
export type JobFormInput = z.infer<typeof createJobInput>;

export const rejectJobInput = z
  .object({ reviewNote: z.string().trim().min(1).max(1000) })
  .strict();
