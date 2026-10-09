import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => {
    const listeners = new Set<(event: MediaQueryListEvent) => void>();

    return {
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(
        (type: string, listener: (event: MediaQueryListEvent) => void) => {
          if (type === "change") {
            listeners.add(listener);
          }
        }
      ),
      removeEventListener: vi.fn(
        (type: string, listener: (event: MediaQueryListEvent) => void) => {
          if (type === "change") {
            listeners.delete(listener);
          }
        }
      ),
      dispatchEvent: vi.fn((event: Event) => {
        listeners.forEach((listener) => listener(event as MediaQueryListEvent));
        return true;
      }),
    };
  }),
});
