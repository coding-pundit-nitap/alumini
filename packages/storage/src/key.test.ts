import { describe, expect, it } from "vitest";

import { avatarKey, isPendingKey, pendingKey } from "./key.ts";

describe("pendingKey", () => {
  it("builds a key under uploads/pending/ from a UUID", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(pendingKey(id)).toBe(`uploads/pending/${id}`);
  });
});

describe("avatarKey", () => {
  it("builds a deterministic derivative key from the owner and the upload id", () => {
    const userId = "22222222-2222-4222-8222-222222222222";
    const uploadId = "11111111-1111-4111-8111-111111111111";
    expect(avatarKey(userId, uploadId)).toBe(
      `avatars/${userId}/${uploadId}.webp`
    );
  });
});

describe("isPendingKey", () => {
  it("recognises a key this module built, and nothing else", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(isPendingKey(pendingKey(id))).toBe(true);
    expect(isPendingKey(`avatars/x/${id}.webp`)).toBe(false);
    expect(isPendingKey("../../etc/passwd")).toBe(false);
  });
});
