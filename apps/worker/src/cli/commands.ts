import { parseArgs } from "node:util";

import { QUEUES } from "@nitap/jobs";
import type { OutboxStore, QueueName } from "@nitap/jobs";
import type { QueueAdmin } from "@nitap/queue";

export type CliDeps = {
  store: OutboxStore;
  admin: QueueAdmin;
  out: (line: string) => void;
  err: (line: string) => void;
  now: () => Date;
  /** Outbox retention (ADR-007: 7 days); replay refuses a window older than this. */
  retentionDays: number;
};

const USAGE = `Usage: pnpm worker:cli <command>

  jobs:list [--queue <name>] [--limit <n>]          failed jobs (the DLQ), without payloads
  jobs:retry --queue <name> (<id>... | --all)       re-queue failed jobs
  outbox:failed [--limit <n>]                        quarantined outbox rows
  outbox:release (<id>... | --all)                   return quarantined rows to the relay
  outbox:replay --since <2h|7d|ISO> [--type <t>] [--execute]
                                                     re-publish published rows (dry run unless --execute)`;

const isQueueName = (value: string): value is QueueName =>
  Object.hasOwn(QUEUES, value);

function parseSince(value: string, now: Date): Date | null {
  const relative = /^(\d+)([hd])$/.exec(value);
  if (relative) {
    const unit = relative[2] === "h" ? 3_600_000 : 86_400_000;
    return new Date(now.getTime() - Number(relative[1]) * unit);
  }
  const absolute = new Date(value);
  return Number.isNaN(absolute.getTime()) ? null : absolute;
}

/** Returns the process exit code: 0 ok, 1 usage error, 2 refused. Every result is one JSON line. */
export async function runCommand(
  argv: string[],
  deps: CliDeps
): Promise<number> {
  const [command, ...rest] = argv;
  const { store, admin, out, err, now } = deps;
  const json = (value: unknown) => out(JSON.stringify(value));
  const usage = (message?: string) => {
    if (message) err(message);
    err(USAGE);
    return 1;
  };

  let parsed;
  try {
    parsed = parseArgs({
      args: rest,
      allowPositionals: true,
      options: {
        queue: { type: "string" },
        limit: { type: "string" },
        all: { type: "boolean" },
        since: { type: "string" },
        type: { type: "string" },
        execute: { type: "boolean" },
      },
    });
  } catch (error) {
    return usage(error instanceof Error ? error.message : "Invalid arguments");
  }
  const { values, positionals } = parsed;
  const limit = values.limit ? Number(values.limit) : 50;
  if (!Number.isInteger(limit) || limit < 1)
    return usage("--limit must be a positive integer");

  switch (command) {
    case "jobs:list": {
      if (values.queue !== undefined && !isQueueName(values.queue)) {
        return usage(`Unknown queue "${values.queue}"`);
      }
      const queues = values.queue
        ? [values.queue as QueueName]
        : (Object.keys(QUEUES) as QueueName[]);
      for (const queue of queues) {
        for (const job of await admin.listFailed(queue, limit)) json(job);
      }
      return 0;
    }

    case "jobs:retry": {
      if (!values.queue || !isQueueName(values.queue))
        return usage("--queue <name> is required");
      if (values.all) {
        json({
          queue: values.queue,
          retried: await admin.retryAll(values.queue),
        });
        return 0;
      }
      if (positionals.length === 0) return usage("Give job ids or --all");
      json({
        queue: values.queue,
        retried: await admin.retry(values.queue, positionals),
      });
      return 0;
    }

    case "outbox:failed": {
      for (const row of await store.listQuarantined(limit)) json(row);
      return 0;
    }

    case "outbox:release": {
      if (!values.all && positionals.length === 0)
        return usage("Give row ids or --all");
      json({
        released: await store.releaseQuarantined(
          values.all ? undefined : positionals
        ),
      });
      return 0;
    }

    case "outbox:replay": {
      if (!values.since) return usage("--since is required");
      const since = parseSince(values.since, now());
      if (!since) return usage(`Cannot read --since "${values.since}"`);
      const oldest = new Date(
        now().getTime() - deps.retentionDays * 86_400_000
      );
      if (since < oldest) {
        err(
          `Refusing: --since is older than the outbox retention (${deps.retentionDays} days); those rows are already pruned.`
        );
        return 2;
      }
      if (!values.execute) {
        json({
          dryRun: true,
          wouldReplay: await store.countReplayable(since, values.type),
        });
        return 0;
      }
      json({ replayed: await store.replay(since, values.type) });
      return 0;
    }

    default:
      return usage(command ? `Unknown command "${command}"` : undefined);
  }
}
