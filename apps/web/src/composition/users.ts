import { audit } from "@/infrastructure/audit";
import { prisma, transactionRunner } from "@/infrastructure/database/client";
import { logger } from "@/infrastructure/observability";
import { authorize, can } from "@/modules/auth";
import {
  createGetOwnProfile,
  createGetProfileForViewer,
  createPrismaProfileStore,
  createProfileAudit,
  createUpdateOwnPrivacy,
  createUpdateOwnProfile,
  noConnectionsLookup,
} from "@/modules/users";

/**
 * Wires the users module to its adapters and to the auth module's `authorize`/`can`. It lives here, not in
 * the module, because a module's infrastructure may not import another module (TDS §5.2, R-10).
 */
const store = createPrismaProfileStore(prisma);

export const getOwnProfile = createGetOwnProfile({ store });

export const getProfileForViewer = createGetProfileForViewer({
  store,
  connections: noConnectionsLookup,
  audit: createProfileAudit({ runner: transactionRunner, audit }),
  can,
  reportError: (error) =>
    logger.warn("profile.connection_lookup_failed", { error }),
});

export const updateOwnProfile = createUpdateOwnProfile({ store, authorize });
export const updateOwnPrivacy = createUpdateOwnPrivacy({ store, authorize });
