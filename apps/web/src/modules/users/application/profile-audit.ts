export interface ProfileAudit {
  /**
   * A privileged read (`profile.read_any`) must leave a trace. Throws if it
   * cannot.
   */
  recordPrivilegedRead(entry: {
    actorId: string;
    targetUserId: string;
  }): Promise<void>;
}
