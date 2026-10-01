import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type { StorageEnv } from "./env.ts";
import type {
  HeadResult,
  PresignedUpload,
  PresignUploadInput,
  StoragePort,
} from "./port.ts";
import { StorageError } from "./port.ts";

/** Every call gets a bound: no request to the store waits forever (TDS §17.2). */
const REQUEST_TIMEOUT_MS = 5_000;
const CONNECTION_TIMEOUT_MS = 2_000;

function wrapFailure(error: unknown, key: string): never {
  if (error instanceof NoSuchKey || error instanceof NotFound) {
    throw new StorageError(`no such key: ${key}`, "not_found", {
      cause: error,
    });
  }
  throw new StorageError(
    error instanceof Error ? error.message : "storage request failed",
    "unavailable",
    { cause: error }
  );
}

/**
 * The only file in this package that imports the AWS SDK. It speaks the S3 API, so MinIO now and any
 * S3-compatible provider later are the same code (TDS §13); only `env` changes.
 */
export function createS3StoragePort(env: StorageEnv): StoragePort {
  // ponytail: assumes path-style URLs (bucket in the path), which is what MinIO uses; a virtual-hosted
  // bucket would lose its host here.
  const toBrowserUrl = (url: string) => {
    if (!env.publicPath) return url;
    const { pathname, search } = new URL(url);
    return env.publicPath + pathname + search;
  };

  const client = new S3Client({
    endpoint: env.endpoint,
    region: env.region,
    forcePathStyle: env.forcePathStyle,
    credentials: {
      accessKeyId: env.accessKeyId,
      secretAccessKey: env.secretAccessKey,
    },
    // Without throwOnRequestTimeout the SDK only logs a warning past requestTimeout and keeps waiting, so a
    // stalled store hung requests forever (spec 14 F-6). One attempt: the caller owns retries (the user's
    // retry on a 503, the queue's backoff in the worker), so the bound stays one timeout, not three.
    requestHandler: {
      connectionTimeout: CONNECTION_TIMEOUT_MS,
      requestTimeout: REQUEST_TIMEOUT_MS,
      throwOnRequestTimeout: true,
    },
    maxAttempts: 1,
  });

  return {
    async presignUpload(input: PresignUploadInput): Promise<PresignedUpload> {
      try {
        const { url, fields } = await createPresignedPost(client, {
          Bucket: env.bucket,
          Key: input.key,
          Conditions: [
            ["content-length-range", 1, input.maxBytes],
            ["eq", "$Content-Type", input.contentType],
          ],
          Fields: { "Content-Type": input.contentType },
          Expires: 300,
        });
        return { url: toBrowserUrl(url), fields };
      } catch (error) {
        wrapFailure(error, input.key);
      }
    },

    async head(key: string): Promise<HeadResult> {
      try {
        const result = await client.send(
          new HeadObjectCommand({ Bucket: env.bucket, Key: key })
        );
        return {
          size: result.ContentLength ?? 0,
          contentType: result.ContentType ?? null,
        };
      } catch (error) {
        wrapFailure(error, key);
      }
    },

    async get(key: string): Promise<Buffer> {
      try {
        const result = await client.send(
          new GetObjectCommand({ Bucket: env.bucket, Key: key })
        );
        const bytes = await result.Body?.transformToByteArray();
        return Buffer.from(bytes ?? new Uint8Array());
      } catch (error) {
        wrapFailure(error, key);
      }
    },

    async put(key: string, body: Buffer, contentType: string): Promise<void> {
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: env.bucket,
            Key: key,
            Body: body,
            ContentType: contentType,
          })
        );
      } catch (error) {
        wrapFailure(error, key);
      }
    },

    async delete(key: string): Promise<void> {
      try {
        await client.send(
          new DeleteObjectCommand({ Bucket: env.bucket, Key: key })
        );
      } catch (error) {
        wrapFailure(error, key);
      }
    },

    async presignDownload(input: {
      key: string;
      expiresInSeconds: number;
    }): Promise<string> {
      try {
        return toBrowserUrl(
          await getSignedUrl(
            client,
            new GetObjectCommand({ Bucket: env.bucket, Key: input.key }),
            { expiresIn: input.expiresInSeconds }
          )
        );
      } catch (error) {
        wrapFailure(error, input.key);
      }
    },
  };
}
