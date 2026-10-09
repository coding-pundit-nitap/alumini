import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  render,
  screen,
  waitFor,
} from "../../../../../tests/support/test-utils";
import { PhotoUpload } from "./photo-upload";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const uploadId = "11111111-1111-4111-8111-111111111111";

function actions(over: Partial<Parameters<typeof PhotoUpload>[0]> = {}) {
  return {
    photoUrl: null,
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
      data: { status: "PENDING_SCAN" as const },
    })),
    statusAction: vi.fn(async () => ({
      ok: true as const,
      data: { status: "READY" as const, rejectReason: null },
    })),
    setPhotoAction: vi.fn(async () => ({
      ok: true as const,
      data: { saved: true as const },
    })),
    ...over,
  };
}

function selectFile(
  input: HTMLElement,
  user: ReturnType<typeof userEvent.setup>,
  name = "photo.png",
  type = "image/png"
) {
  const file = new File(["x"], name, { type });
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
  vi.useRealTimers();
});

describe("PhotoUpload", () => {
  it("shows a placeholder when there is no photo yet", () => {
    render(<PhotoUpload {...actions()} />);
    expect(screen.getByText(/no photo/i)).toBeInTheDocument();
  });

  it("shows the current photo when one is set", () => {
    render(<PhotoUpload {...actions({ photoUrl: "/api/photos/u1" })} />);
    expect(screen.getByRole("img", { name: /profile photo/i })).toHaveAttribute(
      "src",
      "/api/photos/u1"
    );
  });

  it("uploads a selected file: presigns, POSTs to the store, completes, and polls to READY", async () => {
    const a = actions();
    render(<PhotoUpload {...a} pollIntervalMs={5} />);
    const user = userEvent.setup();

    await selectFile(screen.getByLabelText(/choose a photo/i), user);

    await waitFor(() =>
      expect(a.presignAction).toHaveBeenCalledWith({
        mime: "image/png",
        size: 1000,
      })
    );
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "https://store.test/upload",
        expect.objectContaining({ method: "POST" })
      )
    );
    await waitFor(() =>
      expect(a.completeAction).toHaveBeenCalledWith(uploadId)
    );
    await waitFor(() => expect(a.statusAction).toHaveBeenCalledWith(uploadId));

    expect(
      await screen.findByRole("button", { name: "Set as profile photo" })
    ).toBeInTheDocument();
  });

  it("clicking 'Set as profile photo' calls setPhotoAction", async () => {
    const a = actions({
      completeAction: vi.fn(async () => ({
        ok: true as const,
        data: { status: "READY" as const },
      })),
    });
    render(<PhotoUpload {...a} />);
    const user = userEvent.setup();
    await selectFile(screen.getByLabelText(/choose a photo/i), user);

    const button = await screen.findByRole("button", {
      name: "Set as profile photo",
    });
    await user.click(button);
    await waitFor(() =>
      expect(a.setPhotoAction).toHaveBeenCalledWith(uploadId)
    );
  });

  it("shows the field error when presign is refused", async () => {
    const a = actions({
      presignAction: vi.fn(async () => ({
        ok: false as const,
        error: {
          code: "UPLOAD_LIMIT_REACHED",
          message: "Too many uploads in progress.",
        },
        requestId: "r",
      })),
    });
    render(<PhotoUpload {...a} />);
    const user = userEvent.setup();
    await selectFile(screen.getByLabelText(/choose a photo/i), user);

    expect(
      await screen.findByText("Too many uploads in progress.")
    ).toBeInTheDocument();
  });

  it("shows the rejection reason when the scan rejects the image", async () => {
    const a = actions({
      statusAction: vi.fn(async () => ({
        ok: true as const,
        data: {
          status: "REJECTED" as const,
          rejectReason: "Could not process this image.",
        },
      })),
    });
    render(<PhotoUpload {...a} pollIntervalMs={5} />);
    const user = userEvent.setup();
    await selectFile(screen.getByLabelText(/choose a photo/i), user);

    expect(
      await screen.findByText("Could not process this image.")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Set as profile photo" })
    ).toBeNull();
  });

  const refused = (message: string) =>
    vi.fn(async () => ({
      ok: false as const,
      error: { code: "X", message },
      requestId: "r",
    }));
  const status = (value: string, rejectReason: string | null = null) =>
    vi.fn(async () => ({
      ok: true as const,
      data: { status: value, rejectReason },
    })) as never;

  it.each([
    [
      "the storage upload fails",
      () => {
        vi.stubGlobal(
          "fetch",
          vi.fn(async () => new Response(null, { status: 500 }))
        );
        return {};
      },
      "The upload did not go through. Please try again.",
    ],
    [
      "completion is refused",
      () => ({ completeAction: refused("Upload expired.") }),
      "Upload expired.",
    ],
    [
      "the scan rejects it at completion",
      () => ({ completeAction: status("REJECTED") }),
      "This image was rejected.",
    ],
    [
      "a status check is refused",
      () => ({ statusAction: refused("No access.") }),
      "No access.",
    ],
    [
      "the scan rejects it without a reason",
      () => ({ statusAction: status("REJECTED") }),
      "This image was rejected.",
    ],
    [
      "the scan never finishes",
      () => ({ statusAction: status("PENDING_SCAN") }),
      "Still processing. Please check back in a moment.",
    ],
  ])("says so when %s", async (_label, arrange, message) => {
    render(
      <PhotoUpload
        {...actions(arrange())}
        pollIntervalMs={0}
        pollMaxAttempts={2}
      />
    );
    const user = userEvent.setup();
    await selectFile(screen.getByLabelText(/choose a photo/i), user);
    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it("is ready at once when completion finds it clean, and shows a refused save", async () => {
    const a = actions({
      completeAction: status("READY"),
      setPhotoAction: refused("Not your upload."),
    });
    render(<PhotoUpload {...a} />);
    const user = userEvent.setup();
    await selectFile(screen.getByLabelText(/choose a photo/i), user);
    await user.click(
      await screen.findByRole("button", { name: "Set as profile photo" })
    );
    expect(await screen.findByText("Not your upload.")).toBeInTheDocument();
    expect(a.statusAction).not.toHaveBeenCalled();
  });
});
