import type { RoleName } from "./role-permissions";

/** Shown as the tick on a member's photo. Ordered by priority, highest first. */
export const ROLE_TICKS: readonly {
  role: RoleName;
  label: string;
  kind: "student" | "alumni" | "faculty" | "staff" | "team" | "institute";
}[] = [
  { role: "SUPER_ADMIN", label: "Super admin", kind: "institute" },
  { role: "INSTITUTE_ADMIN", label: "Institute admin", kind: "institute" },
  { role: "TP_ADMIN", label: "Placement cell", kind: "institute" },
  { role: "ALUMNI_COORDINATOR", label: "Alumni coordinator", kind: "team" },
  { role: "MODERATOR", label: "Moderator", kind: "team" },
  { role: "FACULTY", label: "Faculty", kind: "faculty" },
  { role: "STAFF", label: "Staff", kind: "staff" },
  { role: "ALUMNI", label: "Alumni", kind: "alumni" },
  { role: "STUDENT", label: "Student", kind: "student" },
];
