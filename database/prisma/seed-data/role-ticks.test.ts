import { describe, expect, it } from "vitest";

import { ROLE_NAMES } from "./role-permissions";
import { ROLE_TICKS } from "./role-ticks";

describe("ROLE_TICKS", () => {
  it("gives every role exactly one tick", () => {
    expect(ROLE_TICKS.map((t) => t.role).sort()).toEqual(
      [...ROLE_NAMES].sort()
    );
  });
});
