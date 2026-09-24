import type { Permission } from "@nitap/database/permissions";

import type { Actor, Resource } from "@/modules/auth";

import type { HeldGrant } from "../domain/escalation";

export type Authorize = (
  actor: Actor | null,
  permission: Permission,
  resource?: Resource
) => Actor;

export type LoadGrants = (
  userId: string,
  now: Date
) => Promise<readonly HeldGrant[]>;
