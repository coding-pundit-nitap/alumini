import { describe, expect, it, vi } from "vitest";

import type { OutboxStore } from "@nitap/jobs";
import type { QueueAdmin } from "@nitap/queue";

import { runCommand } from "./commands.ts";

const NOW = new Date("2026-09-21T12:00:00.000Z");

function setup() {
  const lines: string[] = [];
  const errors: string[] = [];
  const store = {
    listQuarantined: vi.fn(async () => [
      {
        id: "row-1",
        type: "email.send",
        failedAt: new Date("2026-09-21T10:00:00Z"),
        failureReason: "bad payload",
      },
    ]),
    releaseQuarantined: vi.fn(async () => 1),
    countReplayable: vi.fn(async () => 4),
    replay: vi.fn(async () => 4),
  } as unknown as OutboxStore;
  const admin: QueueAdmin = {
    listFailed: vi.fn(async (queue) => [
      {
        queue,
        id: "job-1",
        name: "email.send",
        attemptsMade: 13,
        failedReason: "SMTP 550",
        finishedOn: 1,
      },
    ]),
    retry: vi.fn(async () => 1),
    retryAll: vi.fn(async () => 3),
    jobCounts: vi.fn(async () => ({
      waiting: 0,
      active: 0,
      delayed: 0,
      failed: 0,
      completed: 0,
    })),
    close: vi.fn(async () => {}),
  };
  const deps = {
    store,
    admin,
    out: (l: string) => lines.push(l),
    err: (l: string) => errors.push(l),
    now: () => NOW,
    retentionDays: 7,
  };
  const run = (...argv: string[]) => runCommand(argv, deps);
  return { run, lines, errors, store, admin };
}

describe("worker CLI", () => {
  it("jobs:list prints failed jobs for one queue as JSON lines, without payloads", async () => {
    const { run, lines, admin } = setup();

    expect(await run("jobs:list", "--queue", "email")).toBe(0);

    expect(admin.listFailed).toHaveBeenCalledWith("email", 50);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      queue: "email",
      id: "job-1",
      failedReason: "SMTP 550",
    });
    expect(lines.join("\n")).not.toMatch(/payload|@/);
  });

  it("jobs:list walks every queue when none is given", async () => {
    const { run, admin } = setup();
    expect(await run("jobs:list")).toBe(0);
    expect(
      (admin.listFailed as ReturnType<typeof vi.fn>).mock.calls
        .map((c) => c[0])
        .sort()
    ).toEqual(["default", "email", "scheduled"]);
  });

  it("jobs:retry needs an explicit queue and either ids or --all", async () => {
    const { run, errors, admin } = setup();

    expect(await run("jobs:retry", "job-1")).toBe(1); // no --queue
    expect(await run("jobs:retry", "--queue", "email")).toBe(1); // neither ids nor --all
    expect(admin.retry).not.toHaveBeenCalled();
    expect(errors.length).toBeGreaterThan(0);

    expect(await run("jobs:retry", "--queue", "email", "job-1", "job-2")).toBe(
      0
    );
    expect(admin.retry).toHaveBeenCalledWith("email", ["job-1", "job-2"]);

    expect(await run("jobs:retry", "--queue", "email", "--all")).toBe(0);
    expect(admin.retryAll).toHaveBeenCalledWith("email");
  });

  it("outbox:failed lists quarantined rows", async () => {
    const { run, lines } = setup();
    expect(await run("outbox:failed")).toBe(0);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      id: "row-1",
      failureReason: "bad payload",
    });
  });

  it("outbox:release releases the given ids, or all with --all", async () => {
    const { run, store } = setup();
    expect(await run("outbox:release", "row-1")).toBe(0);
    expect(store.releaseQuarantined).toHaveBeenCalledWith(["row-1"]);
    expect(await run("outbox:release", "--all")).toBe(0);
    expect(store.releaseQuarantined).toHaveBeenCalledWith(undefined);
    expect(await run("outbox:release")).toBe(1);
  });

  it("outbox:replay is a dry run unless --execute is given", async () => {
    const { run, lines, store } = setup();

    expect(await run("outbox:replay", "--since", "2h")).toBe(0);

    expect(store.countReplayable).toHaveBeenCalledWith(
      new Date("2026-09-21T10:00:00.000Z"),
      undefined
    );
    expect(store.replay).not.toHaveBeenCalled();
    expect(JSON.parse(lines[0]!)).toEqual({ dryRun: true, wouldReplay: 4 });
  });

  it("outbox:replay --execute re-publishes, optionally for one type", async () => {
    const { run, lines, store } = setup();

    expect(
      await run(
        "outbox:replay",
        "--since",
        "2026-09-21T00:00:00Z",
        "--type",
        "email.send",
        "--execute"
      )
    ).toBe(0);

    expect(store.replay).toHaveBeenCalledWith(
      new Date("2026-09-21T00:00:00.000Z"),
      "email.send"
    );
    expect(JSON.parse(lines[0]!)).toEqual({ replayed: 4 });
  });

  it("outbox:replay refuses a window older than the outbox retention", async () => {
    const { run, errors, store } = setup();

    expect(await run("outbox:replay", "--since", "8d", "--execute")).toBe(2);

    expect(store.replay).not.toHaveBeenCalled();
    expect(errors.join(" ")).toMatch(/retention/i);
  });

  it("outbox:replay requires --since and a parseable time", async () => {
    const { run } = setup();
    expect(await run("outbox:replay")).toBe(1);
    expect(await run("outbox:replay", "--since", "yesterdayish")).toBe(1);
  });

  it("prints usage and exits 1 for an unknown command", async () => {
    const { run, errors } = setup();
    expect(await run("nope")).toBe(1);
    expect(errors.join("\n")).toMatch(/jobs:list/);
  });
});
