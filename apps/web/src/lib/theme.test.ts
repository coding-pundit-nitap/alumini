import { afterEach, describe, expect, it, vi } from "vitest";
import { applyTheme, parseTheme, THEME_SCRIPT } from "./theme";

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

describe("applyTheme", () => {
  const prefersDark = (dark: boolean) => {
    const cookies: string[] = [];
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: dark }),
    });
    vi.stubGlobal("document", {
      set cookie(value: string) {
        cookies.push(value);
      },
      documentElement: {
        classList: { toggle: vi.fn() },
        style: {} as { colorScheme?: string },
      },
    });
    return cookies;
  };
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ["dark", false, "dark"],
    ["light", true, "light"],
    ["system", true, "dark"],
    ["system", false, "light"],
  ] as const)("%s (system dark: %s) → %s", (pref, systemDark, scheme) => {
    const cookies = prefersDark(systemDark);
    applyTheme(pref);
    expect(cookies[0]).toBe(
      `theme=${pref}; path=/; max-age=31536000; SameSite=Lax`
    );
    expect(document.documentElement.classList.toggle).toHaveBeenCalledWith(
      "dark",
      scheme === "dark"
    );
    expect(document.documentElement.style.colorScheme).toBe(scheme);
  });
});
