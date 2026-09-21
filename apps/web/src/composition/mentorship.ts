import { prisma } from "@/infrastructure/database/client";
import { authorize } from "@/modules/auth";
import {
  createGetMentorProfile,
  createListMentors,
  createPrismaMentorProfileStore,
  createPrismaMentorQueries,
  createSaveMentorProfile,
} from "@/modules/mentorship";

/** Wires the mentorship module to PostgreSQL. Lifecycle use cases join in slice 6b. */
const queries = createPrismaMentorQueries(prisma);
const profileStore = createPrismaMentorProfileStore(prisma);

export const saveMentorProfile = createSaveMentorProfile({
  store: profileStore,
  authorize,
});
export const getMentorProfile = createGetMentorProfile({ queries, authorize });
export const listMentors = createListMentors({ queries, authorize });
