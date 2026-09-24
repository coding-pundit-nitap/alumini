import { describe, expect, it } from "vitest";
import { parseTheme, THEME_SCRIPT } from "./theme";

describe("parseTheme", () => {
  it.each([
    ["light", "light"],
    ["dark", "dark"],
    ["system", "system"],
    [undefined, "system"],
    ["", "system"],
    ["<script>", "system"],
    ["DARK", "system"],
  ])("%s → %s", (input, expected) => {
    expect(parseTheme(input as string | undefined)).toBe(expected);
  });
});

describe("THEME_SCRIPT", () => {
  it("only honours light or dark cookie values", () => {
    expect(THEME_SCRIPT).toContain("theme=(light|dark)");
  });
});
