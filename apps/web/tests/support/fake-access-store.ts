import { ConflictError } from "@/lib/errors";
import type {
  AccessAuditEntry,
  AccessStore,
  GrantRow,
  TargetUser,
} from "@/modules/admin/application/access-store";

/** In-memory AccessStore. `calls` records every tx method in order, so tests can assert what ran. */
export function fakeAccessStore(seed: {
  users?: TargetUser[];
  grants?: GrantRow[];
  chapters?: { id: string; archived: boolean }[];
  superAdmins?: string[];
}) {
  const users = new Map(
    (seed.users ?? []).map((u) => [u.id, { ...u, roles: [...u.roles] }])
  );
  const grants = [...(seed.grants ?? [])];
  const audits: AccessAuditEntry[] = [];
  const calls: string[] = [];
  let sessions = 1;

  const store: AccessStore = {
    async transaction(work) {
      return work({
        async findUserForUpdate(id) {
          calls.push("findUserForUpdate");
          return users.get(id) ?? null;
        },
        async setAccountState(id, from, to) {
          calls.push("setAccountState");
          const u = users.get(id);
          if (!u || u.accountState !== from) return false;
          u.accountState = to;
          return true;
        },
        async deleteSessions() {
          calls.push("deleteSessions");
          const n = sessions;
          sessions = 0;
          return n;
        },
        async lockSuperAdmins() {
          calls.push("lockSuperAdmins");
          return (seed.superAdmins ?? []).filter(
            (id) => users.get(id)?.accountState === "VERIFIED"
          );
        },
        async insertUserRole(userId, role) {
          calls.push("insertUserRole");
          const u = users.get(userId)!;
          if (u.roles.includes(role))
            throw new ConflictError("ROLE_ALREADY_HELD");
          u.roles.push(role);
        },
        async deleteUserRole(userId, role) {
          calls.push("deleteUserRole");
          const u = users.get(userId)!;
          const before = u.roles.length;
          u.roles = u.roles.filter((r) => r !== role);
          return u.roles.length < before;
        },
        async findChapter(id) {
          calls.push("findChapter");
          return seed.chapters?.find((c) => c.id === id) ?? null;
        },
        async insertGrant({ grantedBy: _g, ...g }) {
          calls.push("insertGrant");
          const row = {
            ...g,
            id: `00000000-0000-4000-8000-${String(grants.length).padStart(12, "0")}`,
          };
          grants.push(row);
          return row;
        },
        async findGrant(userId, grantId) {
          calls.push("findGrant");
          return (
            grants.find((g) => g.id === grantId && g.userId === userId) ?? null
          );
        },
        async deleteGrant(grantId) {
          calls.push("deleteGrant");
          grants.splice(
            grants.findIndex((g) => g.id === grantId),
            1
          );
        },
        async audit(entry) {
          calls.push("audit");
          audits.push(entry);
        },
      });
    },
  };
  return { store, users, grants, audits, calls };
}
