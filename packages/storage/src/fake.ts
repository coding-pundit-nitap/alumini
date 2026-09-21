import type {
  HeadResult,
  PresignedUpload,
  PresignUploadInput,
  StoragePort,
} from "./port.ts";
import { StorageError } from "./port.ts";

/**
 * In-memory StoragePort for unit tests. `failWith` makes every operation reject the way the real
 * adapter would for an unreachable store, so a use case's failure handling can be tested without MinIO.
 */
export function createFakeStoragePort(
  options: { failWith?: "unavailable" } = {}
): StoragePort {
  const objects = new Map<string, { body: Buffer; contentType: string }>();

  function maybeFail(): void {
    if (options.failWith === "unavailable") {
      throw new StorageError("storage unavailable (fake)", "unavailable");
    }
  }

  return {
    async presignUpload(input: PresignUploadInput): Promise<PresignedUpload> {
      maybeFail();
      return {
        url: `fake://upload/${input.key}`,
        fields: {
          key: input.key,
          "content-type": input.contentType,
          "x-max-bytes": String(input.maxBytes),
        },
      };
    },

    async head(key: string): Promise<HeadResult> {
      maybeFail();
      const object = objects.get(key);
      if (!object) throw new StorageError(`no such key: ${key}`, "not_found");
      return { size: object.body.byteLength, contentType: object.contentType };
    },

    async get(key: string): Promise<Buffer> {
      maybeFail();
      const object = objects.get(key);
      if (!object) throw new StorageError(`no such key: ${key}`, "not_found");
      return object.body;
    },

    async put(key: string, body: Buffer, contentType: string): Promise<void> {
      maybeFail();
      objects.set(key, { body, contentType });
    },

    async delete(key: string): Promise<void> {
      maybeFail();
      objects.delete(key);
    },

    async presignDownload(input: {
      key: string;
      expiresInSeconds: number;
    }): Promise<string> {
      maybeFail();
      return `fake://download/${input.key}?expires=${input.expiresInSeconds}`;
    },
  };
}
