import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fireEvent,
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

function file(name: string) {
  const f = new File(["x"], name, { type: "image/png" });
  Object.defineProperty(f, "size", { value: 1000 });
  return f;
}

async function expandAndFillContent(
  user: ReturnType<typeof userEvent.setup>,
  text = "My new post"
) {
  await user.click(screen.getByRole("button", { name: /share something/i }));
  await user.type(screen.getByLabelText("Post content"), text);
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 204 }))
  );
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:preview"),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PostComposer", () => {
  it("renders collapsed with a prompt button and no textarea", () => {
    render(<PostComposer {...actions()} />);
    const trigger = screen.getByRole("button", {
      name: /share something with your batchmates/i,
    });
    expect(trigger).toHaveAttribute("id", "compose");
    expect(screen.queryByLabelText("Post content")).not.toBeInTheDocument();
  });

  it("expands and focuses the textarea on click", async () => {
    render(<PostComposer {...actions()} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /share something/i }));
    expect(screen.getByLabelText("Post content")).toHaveFocus();
  });

  it("expands when the collapsed button receives focus programmatically", async () => {
    render(<PostComposer {...actions()} />);
    const trigger = screen.getByRole("button", { name: /share something/i });
    fireEvent.focus(trigger);
    await waitFor(() =>
      expect(screen.getByLabelText("Post content")).toBeInTheDocument()
    );
  });

  it("shows a live character counter only past 4500 characters", async () => {
    render(<PostComposer {...actions()} />);
    const user = userEvent.setup();
    await expandAndFillContent(user, "hello");
    expect(screen.queryByText(/\/5000/)).not.toBeInTheDocument();

    const textarea = screen.getByLabelText("Post content");
    fireEvent.change(textarea, { target: { value: "a".repeat(4501) } });
    expect(screen.getByText("4501/5000")).toBeInTheDocument();
  });

  it("disables submit when content is empty", async () => {
    render(<PostComposer {...actions()} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /share something/i }));
    expect(screen.getByRole("button", { name: /^post$/i })).toBeDisabled();
  });

  it("uploads up to 4 of 6 selected files and renders 4 thumbnails, then disables Add images", async () => {
    const a = actions();
    render(<PostComposer {...a} />);
    const user = userEvent.setup();
    await expandAndFillContent(user);

    const input = screen.getByLabelText("Add images");
    const files = Array.from({ length: 6 }, (_, i) => file(`p${i}.png`));
    await user.upload(input, files);

    await waitFor(() => expect(a.presignAction).toHaveBeenCalledTimes(4));
    await waitFor(() =>
      expect(screen.getAllByLabelText(/^Remove image \d$/)).toHaveLength(4)
    );
    expect(input).toBeDisabled();
  });

  it("disables Post while a slot is still working", async () => {
    let resolvePresign: (value: unknown) => void = () => {};
    const a = actions({
      presignAction: vi.fn(
        () =>
          new Promise((resolve) => {
            resolvePresign = resolve;
          })
      ),
    });
    render(<PostComposer {...a} />);
    const user = userEvent.setup();
    await expandAndFillContent(user);

    await user.upload(screen.getByLabelText("Add images"), file("p.png"));
    expect(screen.getByRole("button", { name: /^post$/i })).toBeDisabled();

    resolvePresign({
      ok: true,
      data: { uploadId, url: "https://store.test/upload", fields: {} },
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^post$/i })).toBeEnabled()
    );
  });

  it("removes a slot via its remove button and omits it from the submit payload", async () => {
    const a = actions();
    render(<PostComposer {...a} />);
    const user = userEvent.setup();
    await expandAndFillContent(user);

    await user.upload(screen.getByLabelText("Add images"), file("p.png"));
    await waitFor(() =>
      expect(screen.getByLabelText("Remove image 1")).toBeInTheDocument()
    );

    await user.click(screen.getByLabelText("Remove image 1"));
    expect(screen.queryByLabelText("Remove image 1")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^post$/i }));
    await waitFor(() =>
      expect(a.onSubmit).toHaveBeenCalledWith({
        content: "My new post",
        imageUrls: [],
        linkUrl: undefined,
      })
    );
  });

  it("submits on Ctrl+Enter in the textarea", async () => {
    const a = actions();
    render(<PostComposer {...a} />);
    const user = userEvent.setup();
    await expandAndFillContent(user);

    await user.keyboard("{Control>}{Enter}{/Control}");
    await waitFor(() => expect(a.onSubmit).toHaveBeenCalled());
  });

  it("reveals the link input when 'Add link' is toggled", async () => {
    render(<PostComposer {...actions()} />);
    const user = userEvent.setup();
    await expandAndFillContent(user);

    expect(screen.queryByLabelText("Link (https)")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /add link/i }));
    expect(screen.getByLabelText("Link (https)")).toBeInTheDocument();
  });

  it("submits content, link and uploaded image ids in the parsed input shape", async () => {
    const a = actions();
    render(<PostComposer {...a} />);
    const user = userEvent.setup();
    await expandAndFillContent(user);

    await user.click(screen.getByRole("button", { name: /add link/i }));
    await user.type(
      screen.getByLabelText("Link (https)"),
      "https://example.test"
    );
    await user.upload(screen.getByLabelText("Add images"), file("p.png"));
    await waitFor(() =>
      expect(a.completeAction).toHaveBeenCalledWith(uploadId)
    );

    await user.click(screen.getByRole("button", { name: /^post$/i }));

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
    await expandAndFillContent(user, "Just text");
    await user.click(screen.getByRole("button", { name: /^post$/i }));
    await waitFor(() =>
      expect(a.onSubmit).toHaveBeenCalledWith({
        content: "Just text",
        imageUrls: [],
        linkUrl: undefined,
      })
    );
  });

  it("shows an alert and stays expanded when submit fails", async () => {
    const a = actions({
      onSubmit: vi.fn(async () => ({
        ok: false as const,
        error: { message: "Something went wrong." },
      })),
    });
    render(<PostComposer {...a} />);
    const user = userEvent.setup();
    await expandAndFillContent(user, "Just text");
    await user.click(screen.getByRole("button", { name: /^post$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong."
    );
    expect(screen.getByLabelText("Post content")).toBeInTheDocument();
  });

  it("clears and collapses the composer after a successful submit", async () => {
    const a = actions();
    render(<PostComposer {...a} />);
    const user = userEvent.setup();
    await expandAndFillContent(user, "Just text");
    await user.click(screen.getByRole("button", { name: /^post$/i }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /share something/i })
      ).toHaveAttribute("id", "compose")
    );
    expect(screen.queryByLabelText("Post content")).not.toBeInTheDocument();
  });
});
