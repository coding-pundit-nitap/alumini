import { describe, expect, it } from "vitest";

import { avatarTone } from "./avatar-tone";

describe("avatarTone", () => {
  it("is stable per seed and spreads different seeds across the palette", () => {
    expect(avatarTone("user-1")).toBe(avatarTone("user-1"));
    const tones = new Set(
      Array.from({ length: 50 }, (_, i) => avatarTone(`user-${i}`))
    );
    expect(tones.size).toBe(5);
  });
});
