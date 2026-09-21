export type MemberUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  accountState: string;
};

/** Everything a use case may do inside one transaction. All methods share that transaction. */
export type MemberTx = {
  findUser(userId: string): Promise<MemberUser | null>;
  /** Creates the profile when absent. Resolves true only when this call created it. */
  ensureProfile(userId: string, fullName: string): Promise<boolean>;
  /** One guarded update, PENDING → VERIFIED. Resolves true only when this call changed the row. */
  markVerified(userId: string): Promise<boolean>;
  /** Idempotent: a role the user already holds is left alone. */
  assignRole(
    userId: string,
    roleName: string,
    grantedBy: string
  ): Promise<void>;
};

export type MemberStore = {
  transaction<T>(work: (tx: MemberTx) => Promise<T>): Promise<T>;
};
