import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActor: vi.fn(),
  createDirectConversation: vi.fn(),
  createGroupConversation: vi.fn(),
  listConversations: vi.fn(),
  getConversation: vi.fn(),
  sendMessage: vi.fn(),
  listMessages: vi.fn(),
  markRead: vi.fn(),
  addParticipant: vi.fn(),
  removeParticipant: vi.fn(),
  reportMessage: vi.fn(),
  listReports: vi.fn(),
}));
vi.mock("@/config/env", () => ({
  env: { BETTER_AUTH_URL: "https://alumni.example.test" },
}));
vi.mock("@/modules/auth", () => ({ getActor: mocks.getActor }));
vi.mock("@/composition/messaging", () => mocks);
// GET /api/v1/reports (in ../reports/route, imported below) now pulls in
// composition/moderation for listReports; that module wires the real Prisma
// client, so it must be doubled here too or this suite fails at import time.
vi.mock("@/composition/moderation", () => mocks);

import { AuthenticationError, NotFoundError } from "@/lib/errors";

import { POST as report } from "../reports/route";
import { GET as getOne } from "./[id]/route";
import { GET as getMessages, POST as postMessage } from "./[id]/messages/route";
import { POST as postRead } from "./[id]/read/route";
import { POST as addMember } from "./[id]/participants/route";
import { DELETE as removeMember } from "./[id]/participants/[userId]/route";
import { GET, POST } from "./route";

const ORIGIN = "https://alumni.example.test";
const id = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const ctx = <P extends Record<string, string>>(params: P) => ({
  params: Promise.resolve(params),
});
const json = (
  url: string,
  method: string,
  body?: unknown,
  origin: string | null = ORIGIN
) =>
  new Request(`https://alumni.example.test${url}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(origin ? { origin } : {}),
    },
    body:
      body === undefined
        ? undefined
        : typeof body === "string"
          ? body
          : JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getActor.mockResolvedValue({ userId: id });
});

describe("POST /conversations", () => {
  it("starts a direct conversation from { recipientId }: 201, Location, no group input", async () => {
    mocks.createDirectConversation.mockResolvedValue({
      conversationId: other,
      created: true,
    });
    const res = await POST(
      json("/api/v1/conversations", "POST", { recipientId: other })
    );
    expect(res.status).toBe(201);
    expect(res.headers.get("Location")).toBe(`/api/v1/conversations/${other}`);
    expect(await res.json()).toEqual({ data: { id: other, isGroup: false } });
  });

  it("answers 200 when the conversation already existed", async () => {
    mocks.createDirectConversation.mockResolvedValue({
      conversationId: other,
      created: false,
    });
    expect(
      (
        await POST(
          json("/api/v1/conversations", "POST", { recipientId: other })
        )
      ).status
    ).toBe(200);
  });

  it("starts a group from { memberIds, title }", async () => {
    mocks.createGroupConversation.mockResolvedValue({ conversationId: other });
    const res = await POST(
      json("/api/v1/conversations", "POST", {
        title: "Crew",
        memberIds: [id, other],
      })
    );
    expect(res.status).toBe(201);
    expect(mocks.createGroupConversation).toHaveBeenCalledWith({
      actor: { userId: id },
      input: { title: "Crew", memberIds: [id, other] },
    });
  });

  it("rejects a cross-origin request, malformed JSON and a body with neither shape", async () => {
    expect(
      (
        await POST(
          json(
            "/api/v1/conversations",
            "POST",
            { recipientId: other },
            "https://evil.test"
          )
        )
      ).status
    ).toBe(403);
    expect(
      (await POST(json("/api/v1/conversations", "POST", "{nope"))).status
    ).toBe(400);
    expect((await POST(json("/api/v1/conversations", "POST", {}))).status).toBe(
      400
    );
    expect(mocks.createDirectConversation).not.toHaveBeenCalled();
  });

  it("maps an unauthenticated caller to 401", async () => {
    mocks.createDirectConversation.mockRejectedValue(new AuthenticationError());
    expect(
      (
        await POST(
          json("/api/v1/conversations", "POST", { recipientId: other })
        )
      ).status
    ).toBe(401);
  });
});

describe("GET /conversations", () => {
  it("lists the inbox, private and uncached, and validates the query", async () => {
    mocks.listConversations.mockResolvedValue({
      data: [],
      page: { limit: 20, nextCursor: null, hasMore: false },
    });
    const res = await GET(json("/api/v1/conversations?limit=5", "GET"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.listConversations).toHaveBeenCalledWith({
      actor: { userId: id },
      limit: 5,
      cursor: undefined,
    });
    expect(
      (await GET(json("/api/v1/conversations?limit=999", "GET"))).status
    ).toBe(400);
  });
});

describe("conversation routes", () => {
  it("GET /conversations/:id is a 404 for a malformed id and for a use-case NOT_FOUND", async () => {
    expect((await getOne(json("/x", "GET"), ctx({ id: "nope" }))).status).toBe(
      404
    );
    mocks.getConversation.mockRejectedValue(new NotFoundError());
    expect((await getOne(json("/x", "GET"), ctx({ id }))).status).toBe(404);
  });

  it("POST /conversations/:id/messages: 201 when created, 200 on replay, body forwarded untouched", async () => {
    const message = {
      id: other,
      seq: "5",
      conversationId: id,
      senderId: id,
      body: "hi",
      clientMessageId: other,
      createdAt: new Date(0),
    };
    mocks.sendMessage
      .mockResolvedValueOnce({ message, created: true })
      .mockResolvedValueOnce({ message, created: false });
    const body = { body: "hi", clientMessageId: other };
    const first = await postMessage(json("/x", "POST", body), ctx({ id }));
    const second = await postMessage(json("/x", "POST", body), ctx({ id }));
    expect([first.status, second.status]).toEqual([201, 200]);
    expect(mocks.sendMessage).toHaveBeenCalledWith({
      actor: { userId: id },
      conversationId: id,
      input: body,
    });
    expect((await first.json()).data).not.toHaveProperty("clientMessageId");
  });

  it("GET /conversations/:id/messages passes the cursor through", async () => {
    mocks.listMessages.mockResolvedValue({
      data: [],
      page: { limit: 20, nextCursor: null, hasMore: false },
    });
    await getMessages(json("/x?cursor=abc&limit=10", "GET"), ctx({ id }));
    expect(mocks.listMessages).toHaveBeenCalledWith({
      actor: { userId: id },
      conversationId: id,
      limit: 10,
      cursor: "abc",
    });
  });

  it("POST /read, POST /participants, DELETE /participants/:userId and POST /reports call their use cases", async () => {
    mocks.markRead.mockResolvedValue(undefined);
    mocks.addParticipant.mockResolvedValue({ added: true });
    mocks.removeParticipant.mockResolvedValue(undefined);
    mocks.reportMessage.mockResolvedValue({ reportId: other, created: true });

    expect(
      (await postRead(json("/x", "POST", { upToSeq: "5" }), ctx({ id }))).status
    ).toBe(204);
    expect(
      (await addMember(json("/x", "POST", { userId: other }), ctx({ id })))
        .status
    ).toBe(200);
    expect(
      (await removeMember(json("/x", "DELETE"), ctx({ id, userId: other })))
        .status
    ).toBe(204);
    const res = await report(
      json("/api/v1/reports", "POST", {
        targetType: "MESSAGE",
        targetId: other,
        reason: "spam",
      })
    );
    expect(res.status).toBe(201);
    expect(mocks.reportMessage).toHaveBeenCalledWith({
      actor: { userId: id },
      messageId: other,
      input: { reason: "spam" },
    });
  });

  const EVIL = "https://evil.test";
  it.each([
    [
      "POST /conversations/:id/messages",
      () =>
        postMessage(
          json("/x", "POST", { body: "hi", clientMessageId: other }, EVIL),
          ctx({ id })
        ),
      mocks.sendMessage,
    ],
    [
      "POST /conversations/:id/read",
      () => postRead(json("/x", "POST", { upToSeq: "5" }, EVIL), ctx({ id })),
      mocks.markRead,
    ],
    [
      "POST /conversations/:id/participants",
      () => addMember(json("/x", "POST", { userId: other }, EVIL), ctx({ id })),
      mocks.addParticipant,
    ],
    [
      "DELETE /conversations/:id/participants/:userId",
      () =>
        removeMember(
          json("/x", "DELETE", undefined, EVIL),
          ctx({ id, userId: other })
        ),
      mocks.removeParticipant,
    ],
    [
      "POST /reports",
      () =>
        report(
          json(
            "/api/v1/reports",
            "POST",
            { targetType: "MESSAGE", targetId: other, reason: "spam" },
            EVIL
          )
        ),
      mocks.reportMessage,
    ],
  ])(
    "%s refuses a cross-origin request with 403",
    async (_name, call, useCase) => {
      expect((await call()).status).toBe(403);
      expect(useCase).not.toHaveBeenCalled();
    }
  );

  it("refuses a report whose target type is not MESSAGE", async () => {
    expect(
      (
        await report(
          json("/api/v1/reports", "POST", {
            targetType: "POST",
            targetId: other,
            reason: "x",
          })
        )
      ).status
    ).toBe(400);
  });
});
