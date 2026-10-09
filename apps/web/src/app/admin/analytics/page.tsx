import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PERMISSIONS } from "@nitap/database/permissions";
import {
  Segmented,
  segmentedItemVariants,
} from "@nitap/ui/components/segmented";

import { AdminPageHeader, AdminPanel } from "@/components/admin/admin-surface";
import { getAnalytics } from "@/composition/admin";
import {
  ANALYTICS_RANGES,
  AnalyticsSectionBody,
  RANGE_DAYS,
  SECTION_COPY,
} from "@/modules/admin";
import { can, getActor } from "@/modules/auth";

export const metadata: Metadata = { title: "Analytics" };

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

/** 404 without analytics.view; sections follow the co-held permissions. */
export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const actor = await getActor();
  if (!actor || !can(actor, PERMISSIONS.ANALYTICS_VIEW)) notFound();
  const { range, sections } = await getAnalytics({
    actor,
    range: first((await searchParams).range),
  });

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Analytics"
        description="Aggregate trends only. Groups smaller than five are shown as “< 5”."
        actions={
          <nav aria-label="Period">
            <Segmented>
              {ANALYTICS_RANGES.map((r) => (
                <Link
                  key={r}
                  href={`/admin/analytics?range=${r}`}
                  aria-current={r === range ? "page" : undefined}
                  className={segmentedItemVariants({ active: r === range })}
                >
                  {RANGE_DAYS[r]} days
                </Link>
              ))}
            </Segmented>
          </nav>
        }
      />
      {sections.map((section) => (
        <AdminPanel key={section.key} {...SECTION_COPY[section.key]}>
          <div className="flex flex-col gap-6 p-4">
            <AnalyticsSectionBody section={section} />
          </div>
        </AdminPanel>
      ))}
    </div>
  );
}
