import { describe, expect, it, vi } from "vitest";

import { render, screen } from "../../../../../tests/support/test-utils";
import { FormField } from "./form-field";

describe("FormField", () => {
  it("labels the input and reports no error by default", () => {
    render(
      <FormField label="Email" name="email" value="" onChange={vi.fn()} />
    );

    const input = screen.getByLabelText("Email");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("marks the input invalid and announces the error", () => {
    render(
      <FormField
        label="Email"
        name="email"
        value=""
        onChange={vi.fn()}
        error="Enter a valid email address."
      />
    );

    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter a valid email address."
    );
    expect(input.getAttribute("aria-describedby")).toBe(
      screen.getByRole("alert").id
    );
  });
});
