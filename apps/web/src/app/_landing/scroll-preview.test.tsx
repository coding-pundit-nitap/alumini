import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import { ScrollPreview } from "./scroll-preview";

describe("ScrollPreview", () => {
  it("is decorative: hidden from assistive tech with nothing focusable", () => {
    const { container } = render(<ScrollPreview />);
    const root = container.firstElementChild!;
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(root.querySelectorAll("a, button, input, [tabindex]")).toHaveLength(
      0
    );
  });

  it("uses generic sample people only", () => {
    const { container } = render(<ScrollPreview />);
    expect(container.textContent).toContain("A batchmate from ECE '19");
    expect(container.textContent).toContain("A mentor from CSE '15");
  });
});
