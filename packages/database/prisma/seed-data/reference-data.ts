/**
 * Provisional list for development, tests and staging; confirm against the official programme list
 * before production. Extend or retire rows (`is_active = false`); never edit them destructively.
 */
export const DEPARTMENTS = [
  { code: "CSE", name: "Computer Science and Engineering", shortName: "CSE" },
  {
    code: "ECE",
    name: "Electronics and Communication Engineering",
    shortName: "ECE",
  },
  {
    code: "EEE",
    name: "Electrical and Electronics Engineering",
    shortName: "EEE",
  },
  { code: "ME", name: "Mechanical Engineering", shortName: "ME" },
  { code: "CE", name: "Civil Engineering", shortName: "CE" },
] as const;

export const DEGREES = [
  { code: "BTECH", name: "Bachelor of Technology", level: "UNDERGRADUATE" },
  { code: "MTECH", name: "Master of Technology", level: "POSTGRADUATE" },
  { code: "PHD", name: "Doctor of Philosophy", level: "DOCTORAL" },
] as const;
