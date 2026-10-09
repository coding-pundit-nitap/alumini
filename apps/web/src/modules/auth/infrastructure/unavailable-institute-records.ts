import type { InstituteRecords } from "../application/institute-records";

/** No institute roster exists yet, so every submission is NOT_CHECKED. */
export const unavailableInstituteRecords: InstituteRecords = {
  async check() {
    return "NOT_CHECKED";
  },
};
