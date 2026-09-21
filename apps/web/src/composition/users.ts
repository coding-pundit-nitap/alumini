import { audit } from "@/infrastructure/audit";
import { prisma, transactionRunner } from "@/infrastructure/database/client";
import { logger } from "@/infrastructure/observability";
import { authorize, can } from "@/modules/auth";
import {
  createCollectionUseCases,
  createGetOwnProfile,
  createGetProfileForViewer,
  createPrismaEducationCollection,
  createPrismaExperienceCollection,
  createPrismaLinkCollection,
  createPrismaProfileStore,
  createPrismaSkillCollection,
  createProfileAudit,
  createUpdateOwnPrivacy,
  createUpdateOwnProfile,
  educationClockProblems,
  experienceClockProblems,
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

// The four detail collections (spec 3B): one shared use-case factory, four explicit Prisma stores.
const now = () => new Date();

export const experienceUseCases = createCollectionUseCases({
  collection: createPrismaExperienceCollection({
    runner: transactionRunner,
    prisma,
  }),
  authorize,
  clockProblems: experienceClockProblems,
  now,
});

export const educationUseCases = createCollectionUseCases({
  collection: createPrismaEducationCollection({
    runner: transactionRunner,
    prisma,
  }),
  authorize,
  clockProblems: educationClockProblems,
  now,
});

export const skillUseCases = createCollectionUseCases({
  collection: createPrismaSkillCollection({
    runner: transactionRunner,
    prisma,
  }),
  authorize,
  now,
});

export const linkUseCases = createCollectionUseCases({
  collection: createPrismaLinkCollection({ runner: transactionRunner, prisma }),
  authorize,
  now,
});
