import type { EmailSendPayload } from "@nitap/jobs";

import type {
  CrossCheck,
  VerificationDecision,
  VerificationStatus,
} from "../domain/verification-request";

export type AccountRecord = {
  id: string;
  name: string;
  email: string;
  accountState: string;
};
export type VerificationRequestRecord = {
  id: string;
  userId: string;
  rollNumber: string;
  departmentId: string;
  degreeId: string;
  graduationYear: number;
  supportingInfo: string | null;
  status: VerificationStatus;
  crossCheck: CrossCheck;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  createdAt: Date;
};
export type NewVerificationRequest = {
  userId: string;
  rollNumber: string;
  departmentId: string;
  degreeId: string;
  graduationYear: number;
  supportingInfo: string | null;
  crossCheck: CrossCheck;
};
export type InstitutionalFields = {
  departmentId: string;
  degreeId: string;
  graduationYear: number;
};
export type PreviousInstitutionalFields = {
  departmentId: string | null;
  degreeId: string | null;
  graduationYear: number | null;
};
export type AuditRecord = {
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown>;
};
export type PendingVerification = {
  id: string;
  submittedAt: Date;
  applicantName: string;
  applicantEmail: string;
  rollNumber: string;
  departmentName: string;
  degreeName: string;
  graduationYear: number;
  supportingInfo: string | null;
  crossCheck: CrossCheck;
};
export type VerificationTx = {
  findAccount(userId: string): Promise<AccountRecord | null>;
  findRequest(id: string): Promise<VerificationRequestRecord | null>;
  latestRequest(userId: string): Promise<VerificationRequestRecord | null>;
  countRejected(userId: string): Promise<number>;
  createRequest(input: NewVerificationRequest): Promise<{ id: string }>;
  decideRequest(input: {
    id: string;
    decision: VerificationDecision;
    reviewerId: string;
    note: string | null;
    now: Date;
  }): Promise<boolean>;
  setAccountState(
    userId: string,
    from: readonly string[],
    to: string
  ): Promise<boolean>;
  /** Returns the values it replaced, so the caller can audit old and new (RBAC §12). */
  applyInstitutionalFields(
    userId: string,
    fields: InstitutionalFields
  ): Promise<PreviousInstitutionalFields>;
  assignRole(
    userId: string,
    roleName: string,
    grantedBy: string
  ): Promise<void>;
  enqueueEmail(payload: EmailSendPayload): Promise<void>;
  recordAudit(entry: AuditRecord): Promise<void>;
};
export type ReferenceOption = { id: string; name: string };

export type VerificationStore = {
  transaction<T>(work: (tx: VerificationTx) => Promise<T>): Promise<T>;
  listPending(input: {
    after: { createdAt: Date; id: string } | null;
    limit: number;
  }): Promise<PendingVerification[]>;
  listReferenceOptions(): Promise<{
    departments: ReferenceOption[];
    degrees: ReferenceOption[];
  }>;
};
