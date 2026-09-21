export interface ProfileAudit {
  /** A privileged read (`profile.read_any`) must leave a trace (RBAC §12). Throws if it cannot. */
  recordPrivilegedRead(entry: {
    actorId: string;
    targetUserId: string;
  }): Promise<void>;
}
