import type { EmailSendPayload } from "@nitap/jobs";

import type {
  AccountRecord,
  AuditRecord,
  PendingVerification,
  PreviousInstitutionalFields,
  VerificationRequestRecord,
  VerificationStore,
  VerificationTx,
} from "@/modules/auth/application/verification-store";

type State = {
  accounts: Map<string, AccountRecord>;
  requests: Map<string, VerificationRequestRecord>;
  roles: { userId: string; roleName: string; grantedBy: string }[];
  profiles: Map<string, PreviousInstitutionalFields>;
  emails: EmailSendPayload[];
  audits: AuditRecord[];
  events: { type: string; payload: unknown }[];
};

/** A throwing transaction restores the previous state. `failOn` makes one operation throw. */
export function createFakeVerificationStore(
  seed: { accounts: AccountRecord[]; requests?: VerificationRequestRecord[] },
  options: { failOn?: keyof VerificationTx } = {}
) {
  let state: State = {
    accounts: new Map(seed.accounts.map((a) => [a.id, { ...a }])),
    requests: new Map((seed.requests ?? []).map((r) => [r.id, { ...r }])),
    roles: [],
    profiles: new Map(),
    emails: [],
    audits: [],
    events: [],
  };
  let sequence = 0;
  let decideLost = false;
  const counters = { transactions: 0, decideRequest: 0 };

  // Typed by method name, so each lambda below is contextually typed from VerificationTx.
  const wrap = <K extends keyof VerificationTx>(
    name: K,
    fn: VerificationTx[K]
  ): VerificationTx[K] =>
    ((...args: unknown[]) => {
      if (options.failOn === name) {
        return Promise.reject(new Error(`injected failure in ${name}`));
      }
      return (fn as (...a: unknown[]) => unknown)(...args);
    }) as VerificationTx[K];

  const tx: VerificationTx = {
    findAccount: wrap("findAccount", async (userId) => {
      const account = state.accounts.get(userId);
      return account ? { ...account } : null;
    }),
    findRequest: wrap("findRequest", async (id) => {
      const request = state.requests.get(id);
      return request ? { ...request } : null;
    }),
    latestRequest: wrap("latestRequest", async (userId) => {
      const own = [...state.requests.values()]
        .filter((r) => r.userId === userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return own[0] ? { ...own[0] } : null;
    }),
    countRejected: wrap(
      "countRejected",
      async (userId) =>
        [...state.requests.values()].filter(
          (r) => r.userId === userId && r.status === "REJECTED"
        ).length
    ),
    createRequest: wrap("createRequest", async (input) => {
      sequence += 1;
      const id = `req-${sequence}`;
      state.requests.set(id, {
        id,
        ...input,
        status: "PENDING",
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: null,
        createdAt: new Date(1_800_000_000_000 + sequence * 1000),
      });
      return { id };
    }),
    decideRequest: wrap(
      "decideRequest",
      async ({ id, decision, reviewerId, note, now }) => {
        counters.decideRequest += 1;
        const request = state.requests.get(id);
        if (decideLost || !request || request.status !== "PENDING")
          return false;
        Object.assign(request, {
          status: decision,
          reviewedBy: reviewerId,
          reviewedAt: now,
          reviewNote: note,
        });
        return true;
      }
    ),
    setAccountState: wrap("setAccountState", async (userId, from, to) => {
      const account = state.accounts.get(userId);
      if (!account || !from.includes(account.accountState)) return false;
      account.accountState = to;
      return true;
    }),
    applyInstitutionalFields: wrap(
      "applyInstitutionalFields",
      async (userId, fields) => {
        const previous = state.profiles.get(userId) ?? {
          departmentId: null,
          degreeId: null,
          graduationYear: null,
        };
        state.profiles.set(userId, { ...fields });
        return { ...previous };
      }
    ),
    assignRole: wrap("assignRole", async (userId, roleName, grantedBy) => {
      if (
        !state.roles.some((r) => r.userId === userId && r.roleName === roleName)
      ) {
        state.roles.push({ userId, roleName, grantedBy });
      }
    }),
    enqueueEmail: wrap("enqueueEmail", async (payload) => {
      state.emails.push(payload);
    }),
    enqueue: wrap("enqueue", async (event) => {
      state.events.push(event);
    }),
    recordAudit: wrap("recordAudit", async (entry) => {
      state.audits.push({ ...entry });
    }),
  };

  const store: VerificationStore = {
    async listReferenceOptions() {
      return {
        departments: [{ id: "dept-1", name: "Computer Science" }],
        degrees: [{ id: "deg-1", name: "B.Tech" }],
      };
    },
    async transaction(work) {
      counters.transactions += 1;
      const before = structuredClone(state);
      try {
        return await work(tx);
      } catch (error) {
        state = before;
        throw error;
      }
    },
    async listPending({ after, limit }) {
      const pending = [...state.requests.values()]
        .filter((r) => r.status === "PENDING")
        .sort(
          (a, b) =>
            a.createdAt.getTime() - b.createdAt.getTime() ||
            a.id.localeCompare(b.id)
        )
        .filter(
          (r) =>
            !after ||
            r.createdAt.getTime() > after.createdAt.getTime() ||
            (r.createdAt.getTime() === after.createdAt.getTime() &&
              r.id > after.id)
        )
        .slice(0, limit);
      return pending.map((r): PendingVerification => {
        const applicant = state.accounts.get(r.userId);
        return {
          id: r.id,
          userId: r.userId,
          submittedAt: r.createdAt,
          applicantName: applicant?.name ?? "",
          applicantEmail: applicant?.email ?? "",
          rollNumber: r.rollNumber,
          departmentName: `Dept ${r.departmentId}`,
          degreeName: `Degree ${r.degreeId}`,
          graduationYear: r.graduationYear,
          supportingInfo: r.supportingInfo,
          crossCheck: r.crossCheck,
          history: [],
        };
      });
    },
  };

  return {
    store,
    counters,
    get accounts() {
      return state.accounts;
    },
    get requests() {
      return state.requests;
    },
    get roles() {
      return state.roles;
    },
    get profiles() {
      return state.profiles;
    },
    get emails() {
      return state.emails;
    },
    get audits() {
      return state.audits;
    },
    get events() {
      return state.events;
    },
    /** The next decideRequest reports that another reviewer got there first. */
    loseDecideRace: () => {
      decideLost = true;
    },
  };
}
