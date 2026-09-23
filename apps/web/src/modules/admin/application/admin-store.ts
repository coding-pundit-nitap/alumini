import type { TileKey } from "../domain/access";
import type { AuditCursor } from "../domain/audit-query";

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

/** Read-only, cross-module SQL (overview AD-2). No method writes. */
export type AdminStore = {
  countTile(key: TileKey, now: Date): Promise<TileCount>;
  listAuditLog(args: {
    filter: AuditFilter;
    after: AuditCursor | null;
    take: number;
  }): Promise<AuditRow[]>;
};
