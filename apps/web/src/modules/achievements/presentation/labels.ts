import {
  Award,
  BadgeCheck,
  BookOpen,
  Rocket,
  Sparkles,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

import type { AchievementRow } from "../application/achievements-store";

export const CATEGORIES = [
  "AWARD",
  "PUBLICATION",
  "PROMOTION",
  "CERTIFICATION",
  "ENTREPRENEURSHIP",
  "OTHER",
] as const;
export type Category = (typeof CATEGORIES)[number];

// Literal class strings so Tailwind's scanner picks them up.
export const CATEGORY: Record<
  Category,
  { label: string; icon: LucideIcon; tone: string }
> = {
  AWARD: { label: "Award", icon: Award, tone: "bg-chart-1/15 text-chart-1" },
  PUBLICATION: {
    label: "Publication",
    icon: BookOpen,
    tone: "bg-chart-4/15 text-chart-4",
  },
  PROMOTION: {
    label: "Promotion",
    icon: TrendingUp,
    tone: "bg-chart-3/15 text-chart-3",
  },
  CERTIFICATION: {
    label: "Certification",
    icon: BadgeCheck,
    tone: "bg-chart-5/15 text-chart-5",
  },
  ENTREPRENEURSHIP: {
    label: "Entrepreneurship",
    icon: Rocket,
    tone: "bg-chart-2/15 text-chart-2",
  },
  OTHER: {
    label: "Other",
    icon: Sparkles,
    tone: "bg-muted text-muted-foreground",
  },
};

/** The category's display meta; an unknown value (the column is a plain string) falls back to Other. */
export const categoryMeta = (category: string) =>
  CATEGORY[category as Category] ?? CATEGORY.OTHER;

export const STATUS: Record<
  AchievementRow["status"],
  { label: string; variant: "brand" | "success" | "destructive" | "secondary" }
> = {
  SUBMITTED: { label: "Awaiting review", variant: "brand" },
  UNDER_REVIEW: { label: "Awaiting review", variant: "brand" },
  APPROVED: { label: "Approved", variant: "success" },
  PUBLISHED: { label: "Published", variant: "success" },
  REJECTED: { label: "Not approved", variant: "destructive" },
  WITHDRAWN: { label: "Withdrawn", variant: "secondary" },
};
