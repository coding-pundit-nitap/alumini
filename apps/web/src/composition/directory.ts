import { prisma } from "@/infrastructure/database/client";
import { redisRateLimitStorage } from "@/infrastructure/redis/rate-limit-storage";
import { authorize } from "@/modules/auth";
import {
  createListDepartments,
  createPostgresSearch,
  createSearchDirectory,
} from "@/modules/directory";

import { addTicks } from "./ticks";

const searchDirectoryBare = createSearchDirectory({
  authorize,
  search: createPostgresSearch(prisma),
  rateLimiter: redisRateLimitStorage,
});
export const searchDirectory: typeof searchDirectoryBare = async (args) => {
  const page = await searchDirectoryBare(args);
  await addTicks(page.data, (person) => person.id);
  return page;
};

export const listDepartments = createListDepartments(prisma);
