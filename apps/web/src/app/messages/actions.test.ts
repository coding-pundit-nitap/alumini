import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActor: vi.fn(),
  createDirectConversation: vi.fn(),
}));
vi.mock("@/modules/auth", () => ({ getActor: mocks.getActor }));
vi.mock("@/composition/messaging", () => ({
  createDirectConversation: mocks.createDirectConversation,
}));
vi.mock("@/app/_actions/run-action", () => ({
  runAction: async (work: () => Promise<unknown>) => {
    try {
      return { ok: true, data: await work() };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: (error as { code?: string }).code ?? "ERR",
          message: (error as Error).message,
        },
      };
    }
  },
}));

import { NotFoundError } from "@/lib/errors";

import { startConversationAction } from "./actions";

const other = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getActor.mockResolvedValue({ userId: "me" });
});

describe("startConversationAction", () => {
  it("starts the conversation for the signed-in member", async () => {
    mocks.createDirectConversation.mockResolvedValue({
      conversationId: "c1",
      created: true,
    });
    expect(await startConversationAction(other)).toEqual({
      ok: true,
      data: { conversationId: "c1" },
    });
    expect(mocks.createDirectConversation).toHaveBeenCalledWith({
      actor: { userId: "me" },
      recipientId: other,
    });
  });

  it("refuses a malformed id before touching the use case", async () => {
    const result = await startConversationAction("not-a-uuid");
    expect(result.ok).toBe(false);
    expect(mocks.createDirectConversation).not.toHaveBeenCalled();
  });

  it("returns the use case's refusal as a safe error", async () => {
    mocks.createDirectConversation.mockRejectedValue(new NotFoundError());
    expect((await startConversationAction(other)).ok).toBe(false);
  });
});
