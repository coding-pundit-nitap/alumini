import type {
  ConnectionAuditEntry,
  ConnectionEvent,
  ConnectionQueries,
  ConnectionStore,
  ConnectionTx,
  ListedConnection,
} from "@/modules/connections/application/connection-store";
import type { ConnectionRow } from "@/modules/connections/domain/connection";

/**
 * In-memory ConnectionStore for unit tests. A transaction that throws restores the previous state, so
 * "the row and its event commit together" is testable without a database. `beforeInsert` lets a test play
 * the competing request that wins the unique pair first.
 */
export function createFakeConnectionStore(
  seed: ConnectionRow[] = [],
  options: {
    accountStates?: Record<string, string>;
    beforeInsert?: (rows: Map<string, ConnectionRow>) => void;
    failEnqueue?: boolean;
    failAudit?: boolean;
  } = {}
) {
  let state = {
    rows: new Map(seed.map((r) => [r.id, { ...r }])),
    events: [] as ConnectionEvent[],
    audits: [] as ConnectionAuditEntry[],
  };
  let sequence = 0;
  const states = options.accountStates ?? {};

  // Rows a competing transaction committed while ours ran: rolling ours back must not erase them.
  const external = new Map<string, ConnectionRow>();

  const pairKey = (a: string, b: string) => `${a}|${b}`;
  const byPair = (a: string, b: string) =>
    [...state.rows.values()].find(
      (r) => pairKey(r.userAId, r.userBId) === pairKey(a, b)
    ) ?? null;

  const tx: ConnectionTx = {
    async findByPair(a, b) {
      const row = byPair(a, b);
      return row ? { ...row } : null;
    },
    async findById(id) {
      const row = state.rows.get(id);
      return row ? { ...row } : null;
    },
    async accountState(userId) {
      return states[userId] ?? "VERIFIED";
    },
    async insert(input) {
      const known = new Set(state.rows.keys());
      options.beforeInsert?.(state.rows);
      for (const [id, row] of state.rows) {
        if (!known.has(id)) external.set(id, { ...row });
      }
      if (byPair(input.userAId, input.userBId)) return null;
      sequence += 1;
      const row: ConnectionRow = { id: `conn-${sequence}`, ...input };
      state.rows.set(row.id, row);
      return { ...row };
    },
    async update(id, from, patch) {
      const row = state.rows.get(id);
      if (!row || row.state !== from) return null;
      Object.assign(row, patch);
      return { ...row };
    },
    async remove(id, from) {
      const row = state.rows.get(id);
      if (!row || row.state !== from) return false;
      state.rows.delete(id);
      return true;
    },
    async enqueue(event) {
      if (options.failEnqueue) throw new Error("outbox down");
      state.events.push(event);
    },
    async audit(entry) {
      if (options.failAudit) throw new Error("audit down");
      state.audits.push(entry);
    },
  };

  const store: ConnectionStore = {
    async transaction(work) {
      const before = {
        rows: new Map([...state.rows].map(([k, v]) => [k, { ...v }])),
        events: [...state.events],
        audits: [...state.audits],
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

  const queries: ConnectionQueries = {
    async between(viewerId, otherId) {
      const [a, b] = [viewerId, otherId].sort();
      return byPair(a as string, b as string);
    },
    async list(userId, filter) {
      const rows = [...state.rows.values()]
        .filter(
          (r) =>
            (r.userAId === userId || r.userBId === userId) &&
            r.state === filter.state
        )
        .sort(
          (x, y) =>
            y.requestedAt.getTime() - x.requestedAt.getTime() ||
            x.id.localeCompare(y.id)
        )
        .filter((r) =>
          filter.after
            ? r.requestedAt < filter.after.requestedAt ||
              (r.requestedAt.getTime() === filter.after.requestedAt.getTime() &&
                r.id > filter.after.id)
            : true
        )
        .slice(0, filter.limit);
      return rows.map((r): ListedConnection => ({
        id: r.id,
        state: r.state,
        direction: r.requestedById === userId ? "OUTGOING" : "INCOMING",
        user: {
          id: r.userAId === userId ? r.userBId : r.userAId,
          fullName: "X",
          hasPhoto: false,
        },
        requestedAt: r.requestedAt,
        respondedAt: r.respondedAt,
      }));
    },
  };

  return {
    store,
    queries,
    rows: () => [...state.rows.values()],
    events: () => state.events,
    audits: () => state.audits,
  };
}
