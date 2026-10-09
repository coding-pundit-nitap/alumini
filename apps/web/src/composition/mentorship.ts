import { addTicks } from "./ticks";
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

const queries = createPrismaMentorQueries(prisma);
const profileStore = createPrismaMentorProfileStore(prisma);

export const saveMentorProfile = createSaveMentorProfile({
  store: profileStore,
  authorize,
});
export const getMentorProfile = createGetMentorProfile({ queries, authorize });
const listMentorsBare = createListMentors({ queries, authorize });
export const listMentors: typeof listMentorsBare = async (args) => {
  const page = await listMentorsBare(args);
  await addTicks(page.data, (mentor) => mentor.userId);
  return page;
};

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

const listMentorshipsBare = createListMentorships({
  queries: createPrismaMentorshipQueries(prisma),
  authorize,
});
export const listMentorships: typeof listMentorshipsBare = async (args) => {
  const page = await listMentorshipsBare(args);
  await addTicks(
    page.data,
    (item) => item.counterparty.id,
    (item) => item.counterparty
  );
  return page;
};
