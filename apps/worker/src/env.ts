import { z } from "zod";

const logLevel = z.enum(["debug", "info", "warn", "error", "fatal", "silent"]);

const workerSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.string().min(1),
  QUEUE_REDIS_URL: z.string().min(1),
  // Cache Redis, used only for real-time message hints; without it messaging still works, clients just refetch.
  REDIS_URL: z.string().min(1).optional(),
  SMTP_URL: z.string().min(1),
  EMAIL_FROM: z.string().min(3),
  EMAIL_RATE_PER_SECOND: z.coerce.number().int().positive().default(5),
  WORKER_HEALTH_PORT: z.coerce.number().int().min(0).max(65535).default(3001),
  LOG_LEVEL: logLevel.optional(),
  APP_VERSION: z.string().min(1).optional(),
});

const cliSchema = workerSchema.pick({
  NODE_ENV: true,
  DATABASE_URL: true,
  QUEUE_REDIS_URL: true,
});

export type WorkerEnv = z.infer<typeof workerSchema>;
export type CliEnv = z.infer<typeof cliSchema>;

/** Names the offending variables, never their values (SMTP_URL and DATABASE_URL carry credentials). */
function parse<T extends z.ZodType>(
  schema: T,
  source: Record<string, string | undefined>
): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const names = [
      ...new Set(result.error.issues.map((issue) => String(issue.path[0]))),
    ];
    throw new Error(`Invalid worker environment: ${names.join(", ")}`);
  }
  return result.data;
}

export const loadEnv = (
  source: Record<string, string | undefined>
): WorkerEnv => parse(workerSchema, source);

export const loadCliEnv = (
  source: Record<string, string | undefined>
): CliEnv => parse(cliSchema, source);
