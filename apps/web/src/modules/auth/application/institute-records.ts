import type { CrossCheck } from "../domain/verification-request";

export type InstituteEvidence = {
  rollNumber: string;
  departmentId: string;
  degreeId: string;
  graduationYear: number;
};

/**
 * Compares submitted evidence with institute records where they exist. It flags, never
 * decides: the result is shown to the reviewer and nothing is approved or rejected because of it.
 */
export interface InstituteRecords {
  check(evidence: InstituteEvidence): Promise<CrossCheck>;
}
