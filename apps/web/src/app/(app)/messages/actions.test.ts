import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActor: vi.fn(),
  createDirectConversation: vi.fn(),
  createGroupConversation: vi.fn(),
  addParticipant: vi.fn(),
  removeParticipant: vi.fn(),
}));
vi.mock("@/modules/auth", () => ({ getActor: mocks.getActor }));
vi.mock("@/composition/messaging", () => ({
  createDirectConversation: mocks.createDirectConversation,
  createGroupConversation: mocks.createGroupConversation,
  addParticipant: mocks.addParticipant,
  removeParticipant: mocks.removeParticipant,
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

import {
  addParticipantAction,
  createGroupAction,
  removeParticipantAction,
  startConversationAction,
} from "./actions";

const other = "22222222-2222-4222-8222-222222222222";
const me2 = "33333333-3333-4333-8333-333333333333";

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

describe("group actions", () => {
  it("createGroupAction forwards title and members for the signed-in member", async () => {
    mocks.createGroupConversation.mockResolvedValue({ conversationId: "g1" });
    expect(
      await createGroupAction({ title: "Crew", memberIds: [other, me2] })
    ).toEqual({ ok: true, data: { conversationId: "g1" } });
    expect(mocks.createGroupConversation).toHaveBeenCalledWith({
      actor: { userId: "me" },
      input: { title: "Crew", memberIds: [other, me2] },
    });
  });

  it("add and remove refuse malformed ids before touching the use case", async () => {
    expect((await addParticipantAction("nope", other)).ok).toBe(false);
    expect((await removeParticipantAction(other, "nope")).ok).toBe(false);
    expect(mocks.addParticipant).not.toHaveBeenCalled();
    expect(mocks.removeParticipant).not.toHaveBeenCalled();
  });

  it("add and remove call their use cases for the signed-in member", async () => {
    mocks.addParticipant.mockResolvedValue({ added: true });
    mocks.removeParticipant.mockResolvedValue(undefined);
    expect(await addParticipantAction(other, me2)).toEqual({
      ok: true,
      data: { added: true },
    });
    expect((await removeParticipantAction(other, me2)).ok).toBe(true);
    expect(mocks.addParticipant).toHaveBeenCalledWith({
      actor: { userId: "me" },
      conversationId: other,
      userId: me2,
    });
  });
});
