import { describe, expect, it } from "vitest";

import { makeCreateEventInput } from "./validation";

const NOW = new Date("2026-06-01T00:00:00Z");
const schema = makeCreateEventInput(() => NOW);

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    title: "A valid title",
    description: "A description that is long enough.",
    startsAt: "2026-07-01T10:00:00Z",
    timezone: "Etc/UTC",
    location: "Main hall",
    isOnline: false,
    capacity: 100,
    registrationDeadline: "2026-06-30T10:00:00Z",
    ...overrides,
  };
}

describe("createEventInput", () => {
  it("accepts a well-formed input", () => {
    const result = schema.safeParse(baseInput());
    expect(result.success).toBe(true);
  });

  it("rejects an unknown field (strict)", () => {
    const result = schema.safeParse(baseInput({ extra: "nope" }));
    expect(result.success).toBe(false);
  });

  it.each([2, 151])("rejects a title of %d characters", (len) => {
    const result = schema.safeParse(baseInput({ title: "a".repeat(len) }));
    expect(result.success).toBe(false);
  });

  it.each([3, 150])("accepts a title of %d characters", (len) => {
    const result = schema.safeParse(baseInput({ title: "a".repeat(len) }));
    expect(result.success).toBe(true);
  });

  it.each([0, 100001])("rejects capacity of %d", (capacity) => {
    const result = schema.safeParse(baseInput({ capacity }));
    expect(result.success).toBe(false);
  });

  it.each([1, 100000])("accepts capacity of %d", (capacity) => {
    const result = schema.safeParse(baseInput({ capacity }));
    expect(result.success).toBe(true);
  });

  it("accepts registrationDeadline equal to startsAt", () => {
    const result = schema.safeParse(
      baseInput({
        startsAt: "2026-07-01T10:00:00Z",
        registrationDeadline: "2026-07-01T10:00:00Z",
      })
    );
    expect(result.success).toBe(true);
  });

  it("rejects registrationDeadline after startsAt", () => {
    const result = schema.safeParse(
      baseInput({
        startsAt: "2026-07-01T10:00:00Z",
        registrationDeadline: "2026-07-01T10:00:01Z",
      })
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some(
          (i) => i.path.join(".") === "registrationDeadline"
        )
      ).toBe(true);
    }
  });

  it("rejects a startsAt in the past", () => {
    const result = schema.safeParse(
      baseInput({ startsAt: "2020-01-01T00:00:00Z" })
    );
    expect(result.success).toBe(false);
  });

  it("rejects an offline event with no location", () => {
    const result = schema.safeParse(
      baseInput({ isOnline: false, location: null })
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path.join(".") === "location")
      ).toBe(true);
    }
  });

  it("accepts an online event with no location", () => {
    const result = schema.safeParse(
      baseInput({ isOnline: true, location: null })
    );
    expect(result.success).toBe(true);
  });

  it("normalises an empty-string location to null", () => {
    const result = schema.safeParse(
      baseInput({ isOnline: true, location: "   " })
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.location).toBeNull();
    }
  });

  it("rejects an invalid IANA timezone", () => {
    const result = schema.safeParse(baseInput({ timezone: "Not/AZone" }));
    expect(result.success).toBe(false);
  });
});
