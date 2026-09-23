import { describe, expect, it, vi } from "vitest";

import { silentLogger } from "../../tests/support.ts";
import {
  createAchievementSubmittedProcessor,
  createReportFiledProcessor,
} from "./community-event.ts";
import { createEventActivityProcessor } from "./event-activity.ts";
import { createJobEventProcessor } from "./job-event.ts";

/**
 * The runtime races the job timeout but cannot kill the processor; a fan-out loop must stop itself on the
 * abort signal, or an orphaned loop keeps delivering alongside the retry.
 */
describe("fan-out loops stop when the job's signal aborts", () => {
  const recipients = ["r1", "r2", "r3"];
  const run = async (
    make: (
      deliver: () => Promise<void>
    ) => (p: never, c: never) => Promise<void>,
    payload: unknown
  ) => {
    const controller = new AbortController();
    const deliver = vi.fn(async () => controller.abort()); // times out during the first delivery
    const processor = make(deliver);
    await expect(
      processor(
        payload as never,
        {
          jobId: "e1",
          attempt: 1,
          requestId: null,
          signal: controller.signal,
          logger: silentLogger(),
        } as never
      )
    ).rejects.toThrow();
    expect(deliver).toHaveBeenCalledTimes(1);
  };
  const common = {
    findEmail: async () => null,
    blocked: async () => false,
  };

  it("event.cancelled", () =>
    run(
      (deliver) =>
        createEventActivityProcessor("cancelled", {
          ...common,
          deliver,
          findActiveRegistrants: async () => recipients,
        }) as never,
      { v: 1, eventId: "ev", actorId: "actor" }
    ));

  it("report.filed", () =>
    run(
      (deliver) =>
        createReportFiledProcessor({
          ...common,
          deliver,
          findModerators: async () => recipients,
          reportExists: async () => true,
        }) as never,
      { v: 1, reportId: "rp", reporterId: "actor" }
    ));

  it("achievement.submitted", () =>
    run(
      (deliver) =>
        createAchievementSubmittedProcessor({
          ...common,
          deliver,
          findModerators: async () => recipients,
          achievementExists: async () => true,
        }) as never,
      { v: 1, achievementId: "a", userId: "actor" }
    ));

  it("job.submitted", () =>
    run(
      (deliver) =>
        createJobEventProcessor("submitted", {
          ...common,
          deliver,
          findModerators: async () => recipients,
        }) as never,
      { v: 1, jobId: "j", postedBy: "actor", actorId: "actor" }
    ));
});
