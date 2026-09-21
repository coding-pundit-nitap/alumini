import type { Permission } from "@nitap/database/permissions";

import type { Actor } from "@/modules/auth";

/** The auth module's `authorize`, injected by the composition root. */
export type Authorize = (actor: Actor | null, permission: Permission) => Actor;
