import { prisma, transactionRunner } from "@/infrastructure/database/client";
import { getMetrics, logger } from "@/infrastructure/observability";
import { outbox } from "@/infrastructure/outbox";
import { redisRateLimitStorage } from "@/infrastructure/redis/rate-limit-storage";
import { authorize } from "@/modules/auth";
import {
  createGetMentorProfile,
  createListMentors,
  createListMentorships,
  createPrismaMentorProfileStore,
  createPrismaMentorQueries,
  createPrismaMentorshipQueries,
  createPrismaMentorshipStore,
  createRequestMentorship,
  createSaveMentorProfile,
  createTransitionMentorship,
  type MentorshipObserver,
} from "@/modules/mentorship";

/** Wires the mentorship module to PostgreSQL and the shared Redis rate limiter. */
const queries = createPrismaMentorQueries(prisma);
const profileStore = createPrismaMentorProfileStore(prisma);

export const saveMentorProfile = createSaveMentorProfile({
  store: profileStore,
  authorize,
});
export const getMentorProfile = createGetMentorProfile({ queries, authorize });
export const listMentors = createListMentors({ queries, authorize });

const store = createPrismaMentorshipStore({
  runner: transactionRunner,
  outbox,
});
/** One log line and one counter per committed outcome (ids only: never a name or a message). */
const observe: MentorshipObserver = (outcome, mentorshipId) => {
  logger.info(`mentorship.${outcome}`, { metadata: { mentorshipId } });
  getMetrics().increment("mentorship_total", { outcome });
};

export const requestMentorship = createRequestMentorship({
  store,
  authorize,
  rateLimiter: redisRateLimitStorage,
  observe,
});
export const transitionMentorship = createTransitionMentorship({
  store,
  authorize,
  observe,
});

export const listMentorships = createListMentorships({
  queries: createPrismaMentorshipQueries(prisma),
  authorize,
});
