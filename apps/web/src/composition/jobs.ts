import { prisma, transactionRunner } from "@/infrastructure/database/client";
import { getMetrics, logger } from "@/infrastructure/observability";
import { outbox } from "@/infrastructure/outbox";
import { redisRateLimitStorage } from "@/infrastructure/redis/rate-limit-storage";
import { authorize, can } from "@/modules/auth";
import {
  createApproveJob,
  createCloseJob,
  createCreateJob,
  createEditJob,
  createGetJob,
  createListMyJobs,
  createListPendingJobs,
  createListPublishedJobs,
  createRejectJob,
  type JobObserver,
} from "@/modules/jobs";
import {
  createPrismaJobQueries,
  createPrismaJobStore,
} from "@/modules/jobs/server";

/** Wires the jobs module to PostgreSQL and the shared Redis rate limiter. */
const queries = createPrismaJobQueries(prisma);
const store = createPrismaJobStore({ runner: transactionRunner, outbox });

/** One log line and one counter per committed outcome; publish_direct is distinct from published (spec J-15). */
const observe: JobObserver = (outcome, jobId) => {
  logger.info(`job.${outcome}`, { metadata: { jobId } });
  getMetrics().increment("job_total", { outcome });
};

export const createJob = createCreateJob({
  store,
  authorize,
  can,
  rateLimiter: redisRateLimitStorage,
  observe,
});
export const editJob = createEditJob({ store, authorize, can, observe });
export const listMyJobs = createListMyJobs({ queries, authorize });
export const getJob = createGetJob({ queries, authorize, can });
export const approveJob = createApproveJob({ store, authorize, observe });
export const rejectJob = createRejectJob({ store, authorize, observe });
export const listPendingJobs = createListPendingJobs({ queries, authorize });
export const closeJob = createCloseJob({ store, authorize, can, observe });
export const listPublishedJobs = createListPublishedJobs({
  queries,
  authorize,
});
