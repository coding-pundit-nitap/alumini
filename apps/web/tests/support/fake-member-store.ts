import type {
  MemberStore,
  MemberTx,
  MemberUser,
} from "@/modules/auth/application/member-store";

/**
 * In-memory MemberStore for unit tests. It does not simulate rollback;
 * integration tests cover that.
 */
export function createFakeMemberStore(users: MemberUser[]) {
  const table = new Map(users.map((user) => [user.id, { ...user }]));
  const profiles = new Map<string, string>();
  const roles: { userId: string; roleName: string; grantedBy: string }[] = [];
  const calls = { transactions: 0, markVerified: 0 };
  let markVerifiedResult: boolean | undefined;

  const tx: MemberTx = {
    async findUser(userId) {
      const user = table.get(userId);
      return user ? { ...user } : null;
    },
    async ensureProfile(userId, fullName) {
      if (profiles.has(userId)) return false;
      profiles.set(userId, fullName);
      return true;
    },
    async markVerified(userId) {
      calls.markVerified += 1;
      if (markVerifiedResult !== undefined) return markVerifiedResult;
      const user = table.get(userId);
      if (!user || user.accountState !== "PENDING") return false;
      user.accountState = "VERIFIED";
      return true;
    },
    async assignRole(userId, roleName, grantedBy) {
      if (roles.some((r) => r.userId === userId && r.roleName === roleName)) {
        return;
      }
      roles.push({ userId, roleName, grantedBy });
    },
  };

  const store: MemberStore = {
    async transaction(work) {
      calls.transactions += 1;
      return work(tx);
    },
  };

  return {
    store,
    profiles,
    roles,
    calls,
    stateOf: (userId: string) => table.get(userId)?.accountState,
    /** Forces markVerified's answer, to simulate losing a race. */
    forceMarkVerified: (value: boolean) => {
      markVerifiedResult = value;
    },
  };
}
