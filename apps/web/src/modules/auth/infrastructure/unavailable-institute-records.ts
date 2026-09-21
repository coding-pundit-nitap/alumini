import type { InstituteRecords } from "../application/institute-records";

/**
 * No institute roster is known to exist (spec 2D, O-1), so nothing can be checked: every submission is
 * NOT_CHECKED and the reviewer decides on the evidence alone. A real adapter replaces this one.
 */
export const unavailableInstituteRecords: InstituteRecords = {
  async check() {
    return "NOT_CHECKED";
  },
};
