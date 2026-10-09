import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/errors";

import {
  MAX_JSON_BODY_BYTES,
  parseJson,
  readBodyText,
  readJson,
} from "./request";

// One bounded reader for every JSON body, so size and type are checked in one place.

const URL_ = "https://alumni.example.test/api/v1/x";
const json = (body: BodyInit | null, headers: HeadersInit = {}) =>
  new Request(URL_, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
    // Node's fetch needs this for a stream body.
    ...(body instanceof ReadableStream ? { duplex: "half" } : {}),
  } as RequestInit);

async function rejection(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e
  );
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

/** A body that never says how long it is and streams more than the cap. */
function endlessStream(chunkBytes: number) {
  let sent = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      sent += chunkBytes;
      controller.enqueue(new Uint8Array(chunkBytes).fill(0x20));
      if (sent > MAX_JSON_BODY_BYTES * 4) controller.close();
    },
  });
}

describe("readJson", () => {
  it("parses a JSON body", async () => {
    await expect(readJson(json('{"a":1}'))).resolves.toEqual({ a: 1 });
  });

  it.each([
    "application/json; charset=utf-8",
    "Application/JSON",
    "application/merge-patch+json",
  ])("accepts the JSON media type %s", async (type) => {
    await expect(
      readJson(json('{"a":1}', { "content-type": type }))
    ).resolves.toEqual({ a: 1 });
  });

  it.each([
    ["text/plain;charset=UTF-8"],
    ["application/x-www-form-urlencoded"],
    ["multipart/form-data; boundary=x"],
    ["application/jsonp"],
  ])("refuses %s with 415 before reading", async (type) => {
    const error = await rejection(
      readJson(json('{"a":1}', { "content-type": type }))
    );
    expect(error.status).toBe(415);
    expect(error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  it("refuses a body with no Content-Type with 415", async () => {
    const request = new Request(URL_, { method: "POST", body: '{"a":1}' });
    request.headers.delete("content-type");
    expect((await rejection(readJson(request))).status).toBe(415);
  });

  it("answers 400 MALFORMED_REQUEST for broken or empty JSON", async () => {
    for (const body of ["{", "", "nul"]) {
      const error = await rejection(readJson(json(body)));
      expect(error.status).toBe(400);
      expect(error.code).toBe("MALFORMED_REQUEST");
    }
  });

  it("accepts a body exactly at the cap", async () => {
    const padding = MAX_JSON_BODY_BYTES - '{"p":""}'.length;
    const body = `{"p":"${"x".repeat(padding)}"}`;
    expect(new TextEncoder().encode(body)).toHaveLength(MAX_JSON_BODY_BYTES);
    await expect(readJson(json(body))).resolves.toHaveProperty("p");
  });

  it("refuses a body one byte over the cap with 413", async () => {
    const padding = MAX_JSON_BODY_BYTES - '{"p":""}'.length + 1;
    const error = await rejection(
      readJson(json(`{"p":"${"x".repeat(padding)}"}`))
    );
    expect(error.status).toBe(413);
    expect(error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("counts bytes, not characters", async () => {
    const char = "é"; // two bytes in UTF-8
    const body = `{"p":"${char.repeat(MAX_JSON_BODY_BYTES / 2)}"}`;
    expect((await rejection(readJson(json(body)))).status).toBe(413);
  });

  it("refuses on a declared Content-Length over the cap without reading", async () => {
    const request = json(endlessStream(1024), {
      "content-length": String(MAX_JSON_BODY_BYTES + 1),
    });
    const error = await rejection(readJson(request));
    expect(error.status).toBe(413);
    expect(request.bodyUsed).toBe(false);
  });

  it("stops reading a stream with no length once it passes the cap", async () => {
    const error = await rejection(readJson(json(endlessStream(8 * 1024))));
    expect(error.status).toBe(413);
  });
});

describe("readBodyText / parseJson (idempotent routes hash the raw text)", () => {
  it("returns the raw text, checked like readJson", async () => {
    await expect(readBodyText(json(' {"a":1} '))).resolves.toBe(' {"a":1} ');
    const error = await rejection(
      readBodyText(json("{}", { "content-type": "text/plain" }))
    );
    expect(error.status).toBe(415);
  });

  it("a request with no body has nothing to type-check: empty text, no 415", async () => {
    const bodiless = new Request(URL_, { method: "POST" });
    await expect(readBodyText(bodiless)).resolves.toBe("");
    const declaredEmpty = new Request(URL_, {
      method: "POST",
      headers: { "content-length": "0" },
    });
    await expect(readBodyText(declaredEmpty)).resolves.toBe("");
  });

  it("parseJson maps a parse failure to MALFORMED_REQUEST", () => {
    expect(parseJson('{"a":1}')).toEqual({ a: 1 });
    expect(() => parseJson("{")).toThrow(
      expect.objectContaining({ code: "MALFORMED_REQUEST" })
    );
  });
});
