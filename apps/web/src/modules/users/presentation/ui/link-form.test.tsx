import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  render,
  screen,
  waitFor,
} from "../../../../../tests/support/test-utils";
import { LinkForm } from "./link-form";
import type { ItemAction } from "./detail-form-support";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));

describe("LinkForm", () => {
  it("submits the type and url", async () => {
    const action = vi.fn<ItemAction>(async () => ({
      ok: true,
      data: undefined,
    }));
    const user = userEvent.setup();
    render(<LinkForm action={action} />);

    await user.selectOptions(screen.getByLabelText("Type"), "GITHUB");
    await user.type(screen.getByLabelText("URL"), "https://github.com/asha");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    const sent = action.mock.calls[0]![0];
    expect(sent.get("type")).toBe("GITHUB");
    expect(sent.get("url")).toBe("https://github.com/asha");
  });

  it("edit mode: prefills the type and url, labels the button Save, and sends the item id", async () => {
    const action = vi.fn<ItemAction>(async () => ({
      ok: true,
      data: undefined,
    }));
    const user = userEvent.setup();
    render(
      <LinkForm
        action={action}
        id="11111111-1111-4111-8111-111111111111"
        defaults={{ type: "GITHUB", url: "https://github.com/asha" }}
      />
    );
    expect(screen.getByLabelText("Type")).toHaveValue("GITHUB");
    expect(screen.getByLabelText("URL")).toHaveValue("https://github.com/asha");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect(action.mock.calls[0]![0].get("id")).toBe(
      "11111111-1111-4111-8111-111111111111"
    );
  });
});
