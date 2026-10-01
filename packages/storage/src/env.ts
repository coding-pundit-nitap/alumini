import { z } from "zod";

const schema = z.object({
  S3_ENDPOINT: z.url("S3_ENDPOINT must be a URL"),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  // Only /storage: that is where apps/web's proxy route lives (app/storage/[...path]).
  S3_PUBLIC_PATH: z
    .literal("/storage", "S3_PUBLIC_PATH must be /storage")
    .optional(),
});

export type StorageEnv = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  /** Same-origin path the app proxies to `endpoint` (apps/web app/storage/[...path] route); browser URLs use it. */
  publicPath?: string;
};

/** Names the offending variables, never their values (the access key and secret are credentials). */
export function loadStorageEnv(
  source: Record<string, string | undefined>
): StorageEnv {
  const result = schema.safeParse(source);
  if (!result.success) {
    const names = [
      ...new Set(result.error.issues.map((issue) => String(issue.path[0]))),
    ];
    throw new Error(`Invalid storage environment: ${names.join(", ")}`);
  }
  const v = result.data;
  return {
    endpoint: v.S3_ENDPOINT,
    region: v.S3_REGION,
    bucket: v.S3_BUCKET,
    accessKeyId: v.S3_ACCESS_KEY_ID,
    secretAccessKey: v.S3_SECRET_ACCESS_KEY,
    forcePathStyle: v.S3_FORCE_PATH_STYLE,
    publicPath: v.S3_PUBLIC_PATH,
  };
}
