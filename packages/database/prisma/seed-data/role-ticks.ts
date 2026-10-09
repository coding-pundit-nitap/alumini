import type { RoleName } from "./role-permissions";

/**
 * Display metadata for roles: the tick on a member's photo. Lives beside the role definitions so the
 * web app never names a role. `kind` picks the tick colour, `label` is what the tick says.
 * Order is priority, highest first: the automatic choice when a member hasn't picked one.
 */
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
