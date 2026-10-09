export const VISIBILITY_LEVELS = [
  "PUBLIC",
  "MEMBERS_ONLY",
  "CONNECTIONS_ONLY",
  "PRIVATE",
] as const;
export type Visibility = (typeof VISIBILITY_LEVELS)[number];

export const OVERRIDE_SECTIONS = [
  "contact",
  "location",
  "experience",
  "education",
] as const;
export type OverrideSection = (typeof OVERRIDE_SECTIONS)[number];
export type Section = "core" | OverrideSection;

export type VisibilitySettings = { visibility: Visibility } & Record<
  OverrideSection,
  Visibility | null
>;

/**
 * Who is looking, resolved by the use case. `blocked` and `privileged` come
 * from the connection and RBAC checks.
 */
export type Viewer =
  | "owner"
  | "privileged"
  | "blocked"
  | "guest"
  | "unverified"
  | "member"
  | "connected";

// Strictness rank, in the same order as the database enum (the CHECK relies on it).
const RANK: Record<Visibility, number> = {
  PUBLIC: 0,
  MEMBERS_ONLY: 1,
  CONNECTIONS_ONLY: 2,
  PRIVATE: 3,
};

export function effectiveLevel(
  settings: VisibilitySettings,
  section: Section
): Visibility {
  if (section === "core") return settings.visibility;
  return settings[section] ?? settings.visibility;
}

export function canView(level: Visibility, viewer: Viewer): boolean {
  switch (viewer) {
    case "owner":
    case "privileged":
      return true;
    case "blocked":
      return false;
    case "guest":
    case "unverified":
      return level === "PUBLIC";
    case "member":
      return level === "PUBLIC" || level === "MEMBERS_ONLY";
    case "connected":
      return level !== "PRIVATE";
  }
}

/**
 * The sections whose override is looser than the profile level (the same
 * invariant as the database CHECKs).
 */
export function overridesNotLooser(
  settings: VisibilitySettings
): OverrideSection[] {
  return OVERRIDE_SECTIONS.filter((section) => {
    const override = settings[section];
    return override !== null && RANK[override] < RANK[settings.visibility];
  });
}
