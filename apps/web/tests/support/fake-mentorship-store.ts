import {
  isOpen,
  SLOT_STATES,
  type MentorContext,
  type MentorshipRow,
  type MentorshipState,
} from "@/modules/mentorship/domain/mentorship";
import type {
  MentorshipEvent,
  MentorshipStore,
  MentorshipTx,
  NewMentorship,
} from "@/modules/mentorship/application/mentorship-store";

type MentorConfig = {
  accepting: boolean;
  maxMentees: number;
  listable: boolean;
};

export type FakeMentorshipStoreOptions = {
  /** Plays a competing insert (the winner of a race) right before this insert checks for an open pair. */
  beforeInsert?: (rows: Map<string, MentorshipRow>) => void;
  /** Plays a competing update (e.g. a concurrent cancel) right before this update's guard check. */
  beforeUpdate?: (rows: Map<string, MentorshipRow>) => void;
  failEnqueue?: boolean;
};

/**
 * A throwing transaction restores the previous state. `beforeInsert` and `beforeUpdate` simulate
 * competing requests.
 */
export function createFakeMentorshipStore(
  seed: MentorshipRow[] = [],
  options: FakeMentorshipStoreOptions = {}
) {
  let state = {
    rows: new Map(seed.map((r) => [r.id, { ...r }])),
    events: [] as MentorshipEvent[],
  };
  const mentors = new Map<string, MentorConfig>();
  const users = new Set<string>();
  const blocks = new Set<string>();
  let sequence = seed.length;

  // Rows a competing transaction committed while ours ran: rolling ours back must not erase them.
  const external = new Map<string, MentorshipRow>();

  const blockKey = (a: string, b: string) => [a, b].sort().join("|");

  const openSlotsFor = (mentorId: string) =>
    [...state.rows.values()].filter(
      (r) =>
        r.mentorId === mentorId &&
        (SLOT_STATES as readonly MentorshipState[]).includes(r.state)
    ).length;

  const openRowFor = (mentorId: string, menteeId: string) =>
    [...state.rows.values()].find(
      (r) =>
        r.mentorId === mentorId && r.menteeId === menteeId && isOpen(r.state)
    ) ?? null;

  const tx: MentorshipTx = {
    async findById(id) {
      const row = state.rows.get(id);
      return row ? { ...row } : null;
    },
    async mentorContext(mentorId) {
      const config = mentors.get(mentorId);
      if (!config) return null;
      const context: MentorContext = {
        accepting: config.accepting,
        maxMentees: config.maxMentees,
        openSlots: openSlotsFor(mentorId),
        listable: config.listable,
      };
      return context;
    },
    async lockMentorCapacity(mentorId) {
      const config = mentors.get(mentorId);
      if (!config) return null;
      return {
        maxMentees: config.maxMentees,
        openSlots: openSlotsFor(mentorId),
      };
    },
    async blocked(a, b) {
      return blocks.has(blockKey(a, b));
    },
    async insert(input: NewMentorship) {
      const known = new Set(state.rows.keys());
      options.beforeInsert?.(state.rows);
      for (const [id, row] of state.rows) {
        if (!known.has(id)) external.set(id, { ...row });
      }
      if (openRowFor(input.mentorId, input.menteeId)) return null;
      sequence += 1;
      const row: MentorshipRow = {
        id: `ms-${sequence}`,
        mentorId: input.mentorId,
        menteeId: input.menteeId,
        state: "REQUESTED",
        topic: input.topic,
        message: input.message,
        responseNote: null,
        requestedAt: input.requestedAt,
        respondedAt: null,
        startedAt: null,
        endedAt: null,
      };
      state.rows.set(row.id, row);
      return { ...row };
    },
    async update(id, from, patch) {
      options.beforeUpdate?.(state.rows);
      const row = state.rows.get(id);
      if (!row || row.state !== from) return null;
      Object.assign(row, patch);
      return { ...row };
    },
    async enqueue(event) {
      if (options.failEnqueue) throw new Error("outbox down");
      state.events.push(event);
    },
  };

  const store: MentorshipStore = {
    async transaction(work) {
      const before = {
        rows: new Map([...state.rows].map(([k, v]) => [k, { ...v }])),
        events: [...state.events],
      };
      try {
        return await work(tx);
      } catch (error) {
        state = before;
        for (const [id, row] of external) state.rows.set(id, { ...row });
        throw error;
      }
    },
  };

  function seedMentor(id: string, config: MentorConfig) {
    mentors.set(id, config);
    users.add(id);
  }

  function seedUser(id: string) {
    users.add(id);
  }

  function seedBlock(a: string, b: string) {
    blocks.add(blockKey(a, b));
  }

  /** Occupies `n` slots for `mentorId` with synthetic ACCEPTED rows, for capacity tests. */
  function openSlotsTaker(mentorId: string, n: number) {
    for (let i = 0; i < n; i += 1) {
      sequence += 1;
      const row: MentorshipRow = {
        id: `ms-${sequence}`,
        mentorId,
        menteeId: `slot-taker-${sequence}`,
        state: "ACCEPTED",
        topic: null,
        message: "seed",
        responseNote: null,
        requestedAt: new Date(),
        respondedAt: new Date(),
        startedAt: null,
        endedAt: null,
      };
      state.rows.set(row.id, row);
    }
  }

  return {
    store,
    seedMentor,
    seedBlock,
    rows: () => [...state.rows.values()],
    events: () => state.events,
    /** Adapts this fake to the shape `describeMentorshipStoreContract` factories return. */
    harness: () => ({
      store,
      seedMentor,
      seedUser,
      seedBlock,
      openSlotsTaker,
      events: () => state.events,
    }),
  };
}
