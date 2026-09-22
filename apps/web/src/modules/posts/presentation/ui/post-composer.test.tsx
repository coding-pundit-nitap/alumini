import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  render,
  screen,
  waitFor,
} from "../../../../../tests/support/test-utils";
import { PostComposer } from "./post-composer";

const uploadId = "11111111-1111-4111-8111-111111111111";

function actions(over: Record<string, unknown> = {}) {
  return {
    onSubmit: vi.fn(async () => ({
      ok: true as const,
      data: { postId: "p1" },
    })),
    presignAction: vi.fn(async () => ({
      ok: true as const,
      data: {
        uploadId,
        url: "https://store.test/upload",
        fields: { key: uploadId },
      },
    })),
    completeAction: vi.fn(async () => ({
      ok: true as const,
      data: { status: "READY" as const },
    })),
    statusAction: vi.fn(async () => ({
      ok: true as const,
      data: { status: "READY" as const, rejectReason: null },
    })),
    ...over,
  };
}

function selectFile(
  input: HTMLElement,
  user: ReturnType<typeof userEvent.setup>
) {
  const file = new File(["x"], "photo.png", { type: "image/png" });
  Object.defineProperty(file, "size", { value: 1000 });
  return user.upload(input, file);
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 204 }))
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PostComposer", () => {
  it("shows a live character counter against the 5000-char server bound", async () => {
    render(<PostComposer {...actions()} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/content/i), "hello");
    expect(screen.getByText("5 / 5000")).toBeInTheDocument();
  });

  it("disables submit when content is empty", () => {
    render(<PostComposer {...actions()} />);
    expect(screen.getByRole("button", { name: /post/i })).toBeDisabled();
  });

  it("renders exactly 4 image pickers, enforcing the cap client-side", () => {
    render(<PostComposer {...actions()} />);
    expect(screen.getAllByLabelText(/image \d/i)).toHaveLength(4);
  });

  it("submits content, link and uploaded image ids in the parsed input shape", async () => {
    const a = actions();
    render(<PostComposer {...a} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/content/i), "My new post");
    await user.type(screen.getByLabelText(/link/i), "https://example.test");
    await selectFile(screen.getByLabelText(/image 1/i), user);
    await waitFor(() =>
      expect(a.completeAction).toHaveBeenCalledWith(uploadId)
    );

    await user.click(screen.getByRole("button", { name: /post/i }));

    await waitFor(() =>
      expect(a.onSubmit).toHaveBeenCalledWith({
        content: "My new post",
        imageUrls: [uploadId],
        linkUrl: "https://example.test",
      })
    );
  });

  it("submits without a link or images when neither is provided", async () => {
    const a = actions();
    render(<PostComposer {...a} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/content/i), "Just text");
    await user.click(screen.getByRole("button", { name: /post/i }));
    await waitFor(() =>
      expect(a.onSubmit).toHaveBeenCalledWith({
        content: "Just text",
        imageUrls: [],
        linkUrl: undefined,
      })
    );
  });
});
