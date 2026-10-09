import fs from "node:fs";
import path from "node:path";

import { ROLE_NAMES, type RoleName } from "@nitap/database/role-permissions";

const DOC = path.resolve(import.meta.dirname, "rbac-permission-matrix.md");

/** Parses the RBAC matrix doc into role → permissions. ● and ○ mean held; any other symbol is an error. */
export function readRoleMatrixFromDoc(): Record<RoleName, ReadonlySet<string>> {
  if (!fs.existsSync(DOC)) {
    throw new Error(
      `${DOC} is missing. The RBAC matrix test reads of it; commit`
    );
  }
  const doc = fs.readFileSync(DOC, "utf8");
  const start = doc.indexOf("## 4. Role");
  const end = doc.indexOf("## 5. Chapter");
  if (start < 0 || end < start) {
    throw new Error("rbac-permission-matrix.md: heading not found");
  }

  const matrix = Object.fromEntries(
    ROLE_NAMES.map((role) => [role, new Set<string>()])
  ) as Record<RoleName, Set<string>>;

  for (const line of doc.slice(start, end).split("\n")) {
    const row = line.match(/^\| `([a-z_.]+)`\s*\|(.*)\|\s*$/);
    if (!row) continue;
    const permission = row[1];
    const rest = row[2];
    if (permission === undefined || rest === undefined) continue;
    const cells = rest.split("|").map((cell) => cell.trim());
    // cells[0] is the Guest column; the seeded roles follow in ROLE_NAMES order.
    ROLE_NAMES.forEach((role, index) => {
      const cell = cells[index + 1];
      if (cell === undefined) {
        throw new Error(`matrix row for ${permission} has too few columns`);
      }
      if (cell === "") return;
      if (cell !== "●" && cell !== "○") {
        throw new Error(
          `unexpected matrix symbol "${cell}" for ${role} × ${permission}`
        );
      }
      matrix[role].add(permission);
    });
  }
  return matrix;
}
