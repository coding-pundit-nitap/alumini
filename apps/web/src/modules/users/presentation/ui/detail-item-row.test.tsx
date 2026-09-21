import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  render,
  screen,
  waitFor,
} from "../../../../../tests/support/test-utils";
import { DetailItemRow } from "./detail-item-row";
import type { ItemAction, ItemActionResult } from "./detail-form-support";

describe("DetailItemRow", () => {
  const id = "11111111-1111-4111-8111-111111111111";

  it("renders the summary, an Edit link and a Remove form carrying the item id", async () => {
    const remove = vi.fn<ItemAction>(
      async () => ({ ok: true, data: undefined }) as ItemActionResult
    );
    const user = userEvent.setup();
    render(
      <DetailItemRow
        summary="Acme — Engineer"
        editHref="/profile/details?edit=experience:11111111-1111-4111-8111-111111111111"
        removeAction={remove}
        id={id}
      />
    );

    expect(screen.getByText("Acme — Engineer")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      "/profile/details?edit=experience:11111111-1111-4111-8111-111111111111"
    );

    await user.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(remove).toHaveBeenCalledOnce());
    expect(remove.mock.calls[0]![0].get("id")).toBe(id);
  });

  it("omits the Edit link when no editHref is given (skills, links)", () => {
    render(
      <DetailItemRow summary="TypeScript" removeAction={vi.fn()} id={id} />
    );
    expect(screen.queryByRole("link", { name: "Edit" })).toBeNull();
  });
});
