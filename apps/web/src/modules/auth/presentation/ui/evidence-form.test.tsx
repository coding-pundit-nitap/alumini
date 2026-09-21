import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  render,
  screen,
  waitFor,
} from "../../../../../tests/support/test-utils";

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: mocks.refresh }),
}));

import { EvidenceForm } from "./evidence-form";

const departments = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Computer Science" },
];
const degrees = [
  { id: "22222222-2222-4222-8222-222222222222", name: "B.Tech" },
];

async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/roll/i), "NITAP-2019-042");
  await user.selectOptions(
    screen.getByLabelText("Department"),
    departments[0]!.id
  );
  await user.selectOptions(screen.getByLabelText("Degree"), degrees[0]!.id);
  await user.selectOptions(screen.getByLabelText("Graduation year"), "2019");
}

beforeEach(() => mocks.refresh.mockReset());

describe("EvidenceForm", () => {
  it("shows field errors and does not call the action for an empty form", async () => {
    const action = vi.fn();
    const user = userEvent.setup();
    render(
      <EvidenceForm
        action={action}
        departments={departments}
        degrees={degrees}
      />
    );

    await user.click(
      screen.getByRole("button", { name: /submit for review/i })
    );

    expect(action).not.toHaveBeenCalled();
    expect(screen.getAllByRole("alert").length).toBeGreaterThanOrEqual(3);
  });

  it("sends only the evidence fields and refreshes on success", async () => {
    const action = vi
      .fn()
      .mockResolvedValue({ ok: true, data: { requestId: "r1" } });
    const user = userEvent.setup();
    render(
      <EvidenceForm
        action={action}
        departments={departments}
        degrees={degrees}
      />
    );
    await fill(user);

    await user.click(
      screen.getByRole("button", { name: /submit for review/i })
    );

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    const sent = action.mock.calls[0]![0] as FormData;
    expect(Object.fromEntries(sent.entries())).toEqual({
      rollNumber: "NITAP-2019-042",
      departmentId: departments[0]!.id,
      degreeId: degrees[0]!.id,
      graduationYear: "2019",
      supportingInfo: "",
    });
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  });

  it("shows the server's per-field and form-level messages", async () => {
    const action = vi.fn().mockResolvedValue({
      ok: false,
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests. Please try again later.",
      },
      requestId: "r",
    });
    const user = userEvent.setup();
    render(
      <EvidenceForm
        action={action}
        departments={departments}
        degrees={degrees}
      />
    );
    await fill(user);

    await user.click(
      screen.getByRole("button", { name: /submit for review/i })
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /too many requests/i
    );
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
