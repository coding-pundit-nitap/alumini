import type { CrossCheck } from "../domain/verification-request";

export type InstituteEvidence = {
  rollNumber: string;
  departmentId: string;
  degreeId: string;
  graduationYear: number;
};

/** Flags mismatches for the reviewer; never approves or rejects on its own. */
export interface InstituteRecords {
  check(evidence: InstituteEvidence): Promise<CrossCheck>;
}
