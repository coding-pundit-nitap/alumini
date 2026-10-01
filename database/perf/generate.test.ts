import { describe, expect, it } from "vitest";

import {
  generatePerfData,
  type PerfOptions,
  type TableRows,
} from "./generate.ts";

const reference = {
  departments: [
    { id: "00000000-0000-4000-8000-000000000001", code: "CSE" },
    { id: "00000000-0000-4000-8000-000000000002", code: "ECE" },
  ],
  degrees: [
    { id: "00000000-0000-4000-8000-000000000011", code: "BTECH" },
    { id: "00000000-0000-4000-8000-000000000012", code: "MTECH" },
    { id: "00000000-0000-4000-8000-000000000013", code: "PHD" },
  ],
  roleIds: Object.fromEntries(
    [
      "STUDENT",
      "ALUMNI",
      "FACULTY",
      "STAFF",
      "MODERATOR",
      "ALUMNI_COORDINATOR",
      "SUPER_ADMIN",
    ].map((name, i) => [
      name,
      `00000000-0000-4000-8000-0000000001${String(i).padStart(2, "0")}`,
    ])
  ),
};
const options: PerfOptions = {
  users: 600,
  seed: 42,
  now: new Date("2026-10-01T00:00:00Z"),
  sessions: 50,
  spikeCapacity: 100,
};

const data = generatePerfData(options, reference);
const rowsOf = (name: string) => {
  const table = data.tables.find((t) => t.table === name) as TableRows;
  const index = (column: string) =>
    table.columns.findIndex(([c]) => c === column);
  return table.rows.map((row) =>
    Object.fromEntries(table.columns.map(([c]) => [c, row[index(c)]]))
  );
};

describe("generatePerfData", () => {
  it("is deterministic for the same options", () => {
    const again = generatePerfData(options, reference);
    expect(JSON.stringify(again)).toBe(JSON.stringify(data));
    const other = generatePerfData({ ...options, seed: 43 }, reference);
    expect(JSON.stringify(other.fixture)).not.toBe(
      JSON.stringify(data.fixture)
    );
  });

  it("gives every row a value per column", () => {
    for (const table of data.tables) {
      for (const row of table.rows)
        expect(row).toHaveLength(table.columns.length);
    }
  });

  it("makes members on top of nine staff accounts, with unique emails", () => {
    const users = rowsOf("user");
    expect(users).toHaveLength(options.users + 9);
    expect(new Set(users.map((u) => String(u.email).toLowerCase())).size).toBe(
      users.length
    );
  });

  it("keeps connections ordered, unique per pair and consistent with their state", () => {
    const seen = new Set<string>();
    for (const c of rowsOf("connection")) {
      expect(String(c.user_a_id) < String(c.user_b_id)).toBe(true);
      const key = `${c.user_a_id}:${c.user_b_id}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      expect([c.user_a_id, c.user_b_id]).toContain(c.requested_by_id);
      expect(c.blocked_by_id !== null).toBe(c.state === "BLOCKED");
      if (c.state === "ACCEPTED" || c.state === "REJECTED")
        expect(c.responded_at).not.toBeNull();
    }
    expect(seen.size).toBeGreaterThan(options.users);
  });

  it("never loosens a profile section below the profile's own visibility", () => {
    const order = ["PUBLIC", "MEMBERS_ONLY", "CONNECTIONS_ONLY", "PRIVATE"];
    for (const p of rowsOf("profile")) {
      for (const section of ["location_visibility", "experience_visibility"]) {
        if (p[section] !== null) {
          expect(order.indexOf(String(p[section]))).toBeGreaterThanOrEqual(
            order.indexOf(String(p.visibility))
          );
        }
      }
    }
  });

  it("marks exactly the open-ended experience as current", () => {
    for (const e of rowsOf("profile_experience")) {
      expect(e.is_current).toBe(e.end_date === null);
      if (e.end_date !== null)
        expect(String(e.end_date) >= String(e.start_date)).toBe(true);
    }
  });

  it("keeps each event's registered_count equal to its REGISTERED rows and within capacity", () => {
    const registered = new Map<string, number>();
    for (const r of rowsOf("event_registration")) {
      if (r.state === "REGISTERED")
        registered.set(
          String(r.event_id),
          (registered.get(String(r.event_id)) ?? 0) + 1
        );
    }
    for (const e of rowsOf("event")) {
      expect(e.registered_count).toBe(registered.get(String(e.id)) ?? 0);
      expect(Number(e.registered_count)).toBeLessThanOrEqual(
        Number(e.capacity)
      );
      expect(String(e.registration_deadline) <= String(e.starts_at)).toBe(true);
    }
    const spike = rowsOf("event").find(
      (e) => e.id === data.fixture.spikeEvent.id
    );
    expect(spike).toMatchObject({
      capacity: 100,
      registered_count: 0,
      status: "SCHEDULED",
    });
  });

  it("numbers messages once, in time order, and keeps read markers and counters consistent", () => {
    const messages = rowsOf("message");
    const seqs = messages.map((m) => Number(m.seq));
    expect(new Set(seqs).size).toBe(seqs.length);
    expect(Math.max(...seqs)).toBe(seqs.length);
    const last = new Map<string, number>();
    for (const m of messages) {
      last.set(
        String(m.conversation_id),
        Math.max(last.get(String(m.conversation_id)) ?? 0, Number(m.seq))
      );
    }
    for (const c of rowsOf("conversation")) {
      expect(Number(c.last_message_seq)).toBe(last.get(String(c.id)) ?? 0);
      expect(c.direct_pair_key === null).toBe(c.is_group === true);
    }
    for (const p of rowsOf("conversation_participant")) {
      expect(Number(p.last_read_seq)).toBeGreaterThanOrEqual(0);
      expect(Number(p.unread_count)).toBeGreaterThanOrEqual(0);
    }
  });

  it("stays within the text-length CHECKs, counting emoji as PostgreSQL does (code points)", () => {
    const length = (v: unknown) => [...String(v)].length;
    for (const p of rowsOf("post"))
      expect(length(p.content)).toBeLessThanOrEqual(5000);
    for (const c of rowsOf("comment"))
      expect(length(c.body)).toBeLessThanOrEqual(2000);
    for (const m of rowsOf("message"))
      expect(length(m.body)).toBeLessThanOrEqual(4000);
    for (const p of rowsOf("profile")) {
      expect(length(p.full_name)).toBeLessThanOrEqual(100);
      if (p.headline !== null)
        expect(length(p.headline)).toBeLessThanOrEqual(120);
      if (p.bio !== null) expect(length(p.bio)).toBeLessThanOrEqual(2000);
    }
    expect(
      rowsOf("post").some((p) =>
        /\p{Extended_Pictographic}/u.test(String(p.content))
      )
    ).toBe(true);
  });

  it("gives load users a session and a fixture to drive the scenarios", () => {
    expect(data.fixture.loadUsers).toHaveLength(options.sessions);
    expect(rowsOf("session")).toHaveLength(options.sessions);
    expect(data.fixture.upcomingEventIds.length).toBeGreaterThan(0);
    expect(data.fixture.publishedJobIds.length).toBeGreaterThan(0);
    expect(data.fixture.searchTerms.length).toBeGreaterThan(10);
    expect(
      data.fixture.loadUsers.filter(
        (u) => (data.fixture.conversationsByUser[u.userId] ?? []).length > 0
      ).length
    ).toBeGreaterThan(options.sessions / 2);
  });
});
