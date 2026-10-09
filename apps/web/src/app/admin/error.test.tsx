import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import AdminError from "./error";

describe("admin error boundary", () => {
  it("offers a retry and the way back, with the error's reference when it has one", async () => {
    const reset = vi.fn();
    const { unmount } = render(
      <AdminError
        error={Object.assign(new Error("x"), { digest: "abc123" })}
        reset={reset}
      />
    );
    expect(screen.getByText("Reference: abc123")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalled();
    expect(
      screen.getByRole("link", { name: "Back to dashboard" })
    ).toHaveAttribute("href", "/admin");
    unmount();
    render(<AdminError error={new Error("x")} reset={reset} />);
    expect(screen.queryByText(/Reference:/)).toBeNull();
  });
});
