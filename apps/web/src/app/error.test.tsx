import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import ErrorPage from "./error";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("app/error.tsx", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("shows safe copy and the reference id, never the raw error message", () => {
    const error = Object.assign(new Error('relation "user" does not exist'), {
      digest: "1234567",
    });
    render(<ErrorPage error={error} reset={vi.fn()} />);

    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.getByText(/1234567/)).toBeInTheDocument();
    expect(screen.queryByText(/relation/)).not.toBeInTheDocument();
  });

  it("omits the reference line when there is no digest", () => {
    render(<ErrorPage error={new Error("x")} reset={vi.fn()} />);
    expect(screen.queryByText(/reference/i)).not.toBeInTheDocument();
  });

  it("offers a retry", async () => {
    const reset = vi.fn();
    render(<ErrorPage error={new Error("x")} reset={reset} />);
    screen.getByRole("button", { name: /try again/i }).click();
    expect(reset).toHaveBeenCalled();
  });
});
