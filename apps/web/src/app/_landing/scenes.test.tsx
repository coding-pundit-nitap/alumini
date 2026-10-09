import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DawnScene } from "./dawn-scene";
import { SunStage } from "./sun-stage";

describe("landing scenes", () => {
  it("draws the dawn as decoration hidden from assistive tech", () => {
    const { container } = render(<DawnScene />);
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelectorAll("svg")).toHaveLength(4);
  });

  it("raises the sun through three stages, with rays only when fully up", () => {
    const { container } = render(
      <>
        <SunStage stage={0} />
        <SunStage stage={1} />
        <SunStage stage={2} />
      </>
    );
    const svgs = container.querySelectorAll("svg");
    expect(svgs[0]!.querySelectorAll("line")).toHaveLength(1);
    expect(svgs[2]!.querySelectorAll("line")).toHaveLength(8);
    expect(svgs[0]!.querySelector("circle")).toHaveAttribute("cy", "58");
  });
});
