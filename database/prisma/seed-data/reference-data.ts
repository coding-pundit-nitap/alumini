/**
 * Provisional department/degree list for local development, tests and staging. Confirm against
 * NIT Arunachal Pradesh's official programme list before seeding a production database — this
 * table is designed to be extended (new rows, `is_active = false` to retire one), never edited
 * destructively, once alumni profiles reference it.
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
