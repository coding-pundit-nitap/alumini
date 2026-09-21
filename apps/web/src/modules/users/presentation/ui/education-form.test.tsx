import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  render,
  screen,
  waitFor,
} from "../../../../../tests/support/test-utils";
import { EducationForm } from "./education-form";
import type { ItemAction } from "./detail-form-support";

describe("EducationForm", () => {
  it("submits institution, qualification and years", async () => {
    const action = vi.fn<ItemAction>(async () => ({
      ok: true,
      data: undefined,
    }));
    const user = userEvent.setup();
    render(<EducationForm action={action} />);

    await user.type(screen.getByLabelText("Institution"), "IIT Madras");
    await user.type(screen.getByLabelText("Qualification"), "M.Tech");
    await user.type(screen.getByLabelText("Start year"), "2019");
    await user.click(screen.getByRole("button", { name: /add/i }));

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    const sent = action.mock.calls[0]![0];
    expect(sent.get("institution")).toBe("IIT Madras");
    expect(sent.get("startYear")).toBe("2019");
  });

  it("edit mode sends the item id", async () => {
    const action = vi.fn<ItemAction>(async () => ({
      ok: true,
      data: undefined,
    }));
    const user = userEvent.setup();
    render(
      <EducationForm
        action={action}
        id="11111111-1111-4111-8111-111111111111"
        defaults={{
          institution: "IIT Madras",
          qualification: "M.Tech",
          fieldOfStudy: null,
          startYear: 2019,
          endYear: null,
        }}
      />
    );
    expect(screen.getByLabelText("Institution")).toHaveValue("IIT Madras");
    await user.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect(action.mock.calls[0]![0].get("id")).toBe(
      "11111111-1111-4111-8111-111111111111"
    );
  });
});
