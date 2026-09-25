import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  render,
  screen,
  waitFor,
} from "../../../../../tests/support/test-utils";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { AnnouncementComposer } from "./announcement-composer";

describe("AnnouncementComposer", () => {
  it("previews the Markdown and publishes after confirmation", async () => {
    const user = userEvent.setup();
    const onPublish = vi.fn(async () => ({
      ok: true as const,
      data: { postId: "p1" },
    }));
    render(<AnnouncementComposer onPublish={onPublish} />);
    await user.type(screen.getByLabelText("Title"), "Convocation");
    await user.type(screen.getByLabelText("Message"), "Hello **all**");
    await user.click(screen.getByRole("tab", { name: "Preview" }));
    expect(screen.getByText("all").tagName).toBe("STRONG");
    await user.click(screen.getByRole("button", { name: "Publish" }));
    await user.click(
      screen.getByRole("button", { name: "Publish and notify" })
    );
    await waitFor(() =>
      expect(onPublish).toHaveBeenCalledWith({
        title: "Convocation",
        content: "Hello **all**",
      })
    );
  });
});
