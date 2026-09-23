import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PreferencesForm } from "./preferences-form";

describe("PreferencesForm", () => {
  it("toggling a domain calls onChange with the domain and new value", async () => {
    const onChange = vi.fn();
    render(
      <PreferencesForm
        preferences={[{ domain: "CONNECTION", email: true }]}
        onChange={onChange}
      />
    );
    await userEvent.click(screen.getByRole("switch", { name: /connection/i }));
    expect(onChange).toHaveBeenCalledWith("CONNECTION", false);
  });

  it("shows a domain with no preference row as enabled by default", () => {
    render(
      <PreferencesForm
        preferences={[{ domain: "EVENT", email: true }]}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole("switch", { name: /event/i })).toBeChecked();
  });
});
