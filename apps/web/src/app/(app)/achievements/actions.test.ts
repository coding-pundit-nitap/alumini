import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: new Headers({ "x-request-id": "req-1" }),
  refresh: vi.fn(),
  getActor: vi.fn(),
  submitAchievement: vi.fn(),
  withdrawAchievement: vi.fn(),
  reviewAchievement: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => mocks.headers }));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));
vi.mock("@/modules/auth", () => ({ getActor: mocks.getActor }));
vi.mock("@/composition/achievements", () => ({
  submitAchievement: mocks.submitAchievement,
  withdrawAchievement: mocks.withdrawAchievement,
  reviewAchievement: mocks.reviewAchievement,
}));

import {
  reviewAchievementAction,
  submitAchievementAction,
  withdrawAchievementAction,
} from "./actions";

const actor = { userId: "u1", accountState: "VERIFIED" };
const id = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  mocks.refresh.mockReset();
  mocks.getActor.mockReset().mockResolvedValue(actor);
  mocks.submitAchievement.mockReset().mockResolvedValue({ achievementId: id });
  mocks.withdrawAchievement.mockReset();
  mocks.reviewAchievement.mockReset();
});

describe("achievement Server Actions", () => {
  it("submit, withdraw and review with the session's actor, then refresh", async () => {
    expect(await submitAchievementAction({ title: "t" })).toEqual({
      ok: true,
      data: { achievementId: id },
    });
    expect(mocks.submitAchievement).toHaveBeenCalledWith({
      actor,
      input: { title: "t" },
    });
    expect(await withdrawAchievementAction(id)).toEqual({ ok: true, data: {} });
    expect(mocks.withdrawAchievement).toHaveBeenCalledWith({
      actor,
      achievementId: id,
    });
    expect(await reviewAchievementAction(id, "approve")).toEqual({
      ok: true,
      data: {},
    });
    expect(mocks.reviewAchievement).toHaveBeenCalledWith({
      actor,
      achievementId: id,
      outcome: "approve",
    });
    expect(mocks.refresh).toHaveBeenCalledTimes(3);
  });

  it("refuse a bad id or outcome before calling the use case", async () => {
    expect(await withdrawAchievementAction("x")).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED" },
    });
    expect(await reviewAchievementAction("x", "reject")).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED" },
    });
    expect(
      await reviewAchievementAction(id, "maybe" as "approve")
    ).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(mocks.withdrawAchievement).not.toHaveBeenCalled();
    expect(mocks.reviewAchievement).not.toHaveBeenCalled();
  });
});
