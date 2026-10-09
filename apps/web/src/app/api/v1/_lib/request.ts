import { z } from "zod";

import {
  NotFoundError,
  RequestRejectedError,
  ValidationError,
} from "@/lib/errors";

const id = z.uuid();

/** A malformed id and an unknown one are the same answer. */
export function uuidParam(value: string): string {
  const parsed = id.safeParse(value);
  if (!parsed.success) throw new NotFoundError();
  return parsed.data;
}

/** Far above the largest legitimate body (a few KiB) without letting a client make us buffer megabytes. */
export const MAX_JSON_BODY_BYTES = 64 * 1024;

function isJsonMediaType(header: string | null): boolean {
  const type = header?.split(";")[0]?.trim().toLowerCase() ?? "";
  return (
    type === "application/json" || /^application\/[\w.-]+\+json$/.test(type)
  );
}

/** Refuses non-JSON with 415 and oversized bodies with 413, counting bytes as they stream. */
export async function readBodyText(request: Request): Promise<string> {
  // No body (a bodiless POST such as an event registration): nothing to type-check or bound.
  if (!request.body || request.headers.get("content-length") === "0") return "";
  if (!isJsonMediaType(request.headers.get("content-type"))) {
    throw new RequestRejectedError("UNSUPPORTED_MEDIA_TYPE");
  }
  const declared = Number(request.headers.get("content-length"));
  if (declared > MAX_JSON_BODY_BYTES) {
    throw new RequestRejectedError("PAYLOAD_TOO_LARGE");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_JSON_BODY_BYTES) {
      await reader.cancel();
      throw new RequestRejectedError("PAYLOAD_TOO_LARGE");
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/** JSON.parse with the API's answer for a body that is not JSON. */
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ValidationError({ code: "MALFORMED_REQUEST" });
  }
}

/** Every Route Handler reads a JSON body through this (an architecture test forbids `request.json()`). */
export async function readJson(request: Request): Promise<unknown> {
  return parseJson(await readBodyText(request));
}

export function invalid(error: z.ZodError) {
  return new ValidationError({
    details: error.issues.map((issue) => ({
      field: issue.path.join(".") || "(body)",
      code: "INVALID",
      message: issue.message,
    })),
  });
}
