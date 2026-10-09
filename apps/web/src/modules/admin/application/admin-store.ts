import type { TileKey } from "../domain/access";
import type {
  AnalyticsWindow,
  CommunityRaw,
  DonationsRaw,
  EventsRaw,
  JobsRaw,
  MembersRaw,
} from "../domain/analytics";
import type { AuditCursor } from "../domain/audit-query";
import type { KeysetCursor } from "../domain/keyset-cursor";

export type MembersSummary = {
  byState: Record<string, number>;
  newLast7Days: number;
};
export type TileCount = number | MembersSummary;

export type AuditFilter = {
  actorId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  from?: Date;
  to?: Date;
};

export type AuditRow = {
  id: string;
  createdAt: Date;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown>;
  requestId: string | null;
  actor: { id: string; name: string; email: string };
};

export type UserFilter = { q?: string; state?: string; role?: string };
export type UserRow = {
  id: string;
  name: string;
  email: string;
  accountState: string;
  roles: string[];
  createdAt: Date;
};
export type PersonRef = { id: string; name: string };
export type UserDetail = {
  id: string;
  name: string;
  email: string;
  accountState: string;
  deactivatedAt: Date | null;
  createdAt: Date;
  roles: { name: string; grantedAt: Date; grantedBy: PersonRef }[];
  grants: {
    id: string;
    permission: string;
    scope: "GLOBAL" | "CHAPTER";
    chapterId: string | null;
    chapterSlug: string | null;
    grantedAt: Date;
    expiresAt: Date | null;
    grantedBy: PersonRef;
  }[];
  /** True when this user is the only VERIFIED super admin (drives the disabled state). */
  isLastSuperAdmin: boolean;
};

/** Read-only, cross-module SQL. No method writes. */
export type AdminStore = {
  countTile(key: TileKey, now: Date): Promise<TileCount>;
  listAuditLog(args: {
    filter: AuditFilter;
    after: AuditCursor | null;
    take: number;
  }): Promise<AuditRow[]>;
  listUsers(args: {
    filter: UserFilter;
    after: KeysetCursor | null;
    take: number;
  }): Promise<UserRow[]>;
  getUser(id: string, superAdminRole: string): Promise<UserDetail | null>;
  listChapters(): Promise<{ id: string; slug: string }[]>;
};

/** One aggregate read per analytics section, all over `[from, to)`. Read-only. */
export type AnalyticsStore = {
  membersSection(window: AnalyticsWindow): Promise<MembersRaw>;
  jobsSection(window: AnalyticsWindow): Promise<JobsRaw>;
  eventsSection(window: AnalyticsWindow): Promise<EventsRaw>;
  communitySection(window: AnalyticsWindow): Promise<CommunityRaw>;
  donationsSection(window: AnalyticsWindow): Promise<DonationsRaw>;
};

export type RetentionRow = {
  id: string;
  category: string;
  retentionDays: number;
  approvedBy: string | null;
  updatedAt: Date;
  updatedBy: { id: string; name: string } | null;
};

/** Settings writes, each with its `config.changed` audit row in the same transaction. */
export type SettingsTx = {
  findForUpdate(
    category: string
  ): Promise<Pick<RetentionRow, "id" | "retentionDays" | "approvedBy"> | null>;
  update(
    id: string,
    values: { retentionDays: number; approvedBy: string | null },
    actorId: string
  ): Promise<void>;
  audit(entry: {
    actorId: string;
    targetId: string;
    /** Identifiers and outcomes only; the sign-off name stays in the table. */
    metadata: {
      key: string;
      from: { retentionDays: number; approved: boolean };
      to: { retentionDays: number; approved: boolean };
    };
  }): Promise<void>;
};
export type SettingsStore = {
  listRetention(): Promise<RetentionRow[]>;
  transaction<T>(fn: (tx: SettingsTx) => Promise<T>): Promise<T>;
};
