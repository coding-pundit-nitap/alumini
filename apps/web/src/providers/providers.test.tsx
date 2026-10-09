import { render, screen } from "@testing-library/react";
import { useQueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-query-devtools", () => ({
  ReactQueryDevtools: () => null,
}));

import { Providers } from "./index";

function Probe() {
  return <p>{useQueryClient() ? "has client" : "none"}</p>;
}

describe("Providers", () => {
  it("gives the page a query client", () => {
    render(
      <Providers>
        <Probe />
      </Providers>
    );
    expect(screen.getByText("has client")).toBeInTheDocument();
  });
});
