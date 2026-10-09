import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "happy-dom",
    setupFiles: ["./tests/setup.dom.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      // The code this package owns. Every other component is shadcn's generated wrapper around a Base UI
      // primitive (`shadcn add`, components.json), vendored as is; the app's component tests exercise them.
      include: [
        "src/lib/**/*.ts",
        "src/components/{initials-avatar,role-tick,segmented}.tsx",
      ],
      exclude: ["src/**/*.test.{ts,tsx}"],
      thresholds: { statements: 95, lines: 95, functions: 95, branches: 90 },
    },
  },
});
