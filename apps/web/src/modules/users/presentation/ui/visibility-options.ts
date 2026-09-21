import type { Visibility } from "../../domain/visibility";

export const LEVEL_LABEL: Record<Visibility, string> = {
  PUBLIC: "Everyone, including people who are not signed in",
  MEMBERS_ONLY: "Verified members",
  CONNECTIONS_ONLY: "Connections",
  PRIVATE: "Only me",
};

const ORDER: Visibility[] = [
  "PUBLIC",
  "MEMBERS_ONLY",
  "CONNECTIONS_ONLY",
  "PRIVATE",
];

/** Levels an override may take for a given profile level: equal or stricter. */
export const levelsAtLeast = (base: Visibility): Visibility[] =>
  ORDER.slice(ORDER.indexOf(base));
