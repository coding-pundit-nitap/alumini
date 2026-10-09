/** Queue names and their starting concurrency. One noisy job class cannot starve another. */
export const QUEUES = {
  default: { concurrency: 10 },
  email: { concurrency: 5 },
  scheduled: { concurrency: 1 },
} as const;

export type QueueName = keyof typeof QUEUES;
