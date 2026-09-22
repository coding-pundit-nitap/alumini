import { transactionRunner } from "@/infrastructure/database/client";
import { outbox } from "@/infrastructure/outbox";
import {
  createListOwnAchievements,
  createPrismaAchievementsStore,
  createReviewAchievement,
  createSubmitAchievement,
  createWithdrawAchievement,
} from "@/modules/achievements";
import { authorize } from "@/modules/auth";

/** Wires the achievements module to PostgreSQL (mirrors composition/posts.ts's shape). */
const store = createPrismaAchievementsStore({
  runner: transactionRunner,
  outbox,
});
const deps = { store, authorize };

export const submitAchievement = createSubmitAchievement(deps);
export const withdrawAchievement = createWithdrawAchievement(deps);
export const reviewAchievement = createReviewAchievement(deps);
export const listOwnAchievements = createListOwnAchievements(deps);
