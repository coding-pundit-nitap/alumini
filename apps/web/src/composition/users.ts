import { audit } from "@/infrastructure/audit";
import { prisma, transactionRunner } from "@/infrastructure/database/client";
import { logger } from "@/infrastructure/observability";
import { authorize, can } from "@/modules/auth";
import { connectionLookup } from "./connections";
import {
  createCollectionUseCases,
  createGetBadgeSettings,
  createPrismaBadgeStore,
  createSetBadgeRole,
  createGetOwnProfile,
  createGetProfileForViewer,
  createGetProfilePhotoKey,
  createPrismaEducationCollection,
  createPrismaExperienceCollection,
  createPrismaLinkCollection,
  createPrismaProfileStore,
  createPrismaSkillCollection,
  createProfileAudit,
  createUpdateOwnPrivacy,
  createUpdateOwnProfile,
  createUpdateProfilePhoto,
  educationClockProblems,
  experienceClockProblems,
} from "@/modules/users";

/** Lives here because a module's infrastructure may not import another module. */
const store = createPrismaProfileStore(prisma);

export const getOwnProfile = createGetOwnProfile({ store });

export const getProfileForViewer = createGetProfileForViewer({
  store,
  connections: connectionLookup,
  audit: createProfileAudit({ runner: transactionRunner, audit }),
  can,
  reportError: (error) =>
    logger.warn("profile.connection_lookup_failed", { error }),
});

export const getProfilePhotoKey = createGetProfilePhotoKey({
  store,
  connections: connectionLookup,
  can,
  reportError: (error) =>
    logger.warn("profile.connection_lookup_failed", { error }),
});

export const updateOwnProfile = createUpdateOwnProfile({ store, authorize });
// Called only from the uploads module's setProfilePhoto, after it verifies ownership and READY status.
export const updateProfilePhoto = createUpdateProfilePhoto({
  store,
  authorize,
});
export const updateOwnPrivacy = createUpdateOwnPrivacy({ store, authorize });

const badges = createPrismaBadgeStore(prisma);
export const getBadgeSettings = createGetBadgeSettings({ badges, authorize });
export const setBadgeRole = createSetBadgeRole({ badges, authorize });

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
