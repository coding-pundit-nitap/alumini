import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Megaphone } from "lucide-react";

import { PERMISSIONS } from "@nitap/database/permissions";

import {
  AdminEmpty,
  AdminPager,
  AdminPageHeader,
  AdminPanel,
} from "@/components/admin/admin-surface";
import { listAnnouncements } from "@/composition/posts";
import { AppError } from "@/lib/errors";
import { relativeTime } from "@/lib/relative-time";
import { ConfirmButton } from "@/modules/admin";
import { can, getActor } from "@/modules/auth";
import { AnnouncementComposer } from "@/modules/posts";

import { publishAnnouncementAction, removeAnnouncementAction } from "./actions";

export const metadata: Metadata = { title: "Announcements" };

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

/** Phase 12E (spec E-9). 404 without announcement.publish (RBAC §8 rule 6). */
export default async function AdminAnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const actor = await getActor();
  if (!actor || !can(actor, PERMISSIONS.ANNOUNCEMENT_PUBLISH)) notFound();
  const cursor = first((await searchParams).cursor);

  let page;
  try {
    page = await listAnnouncements({ actor, cursor });
  } catch (error) {
    if (error instanceof AppError && error.code === "INVALID_CURSOR")
      redirect("/admin/announcements");
    throw error;
  }
  const nextHref = page.nextCursor
    ? `/admin/announcements?cursor=${encodeURIComponent(page.nextCursor)}`
    : null;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <AdminPageHeader
        title="Announcements"
        description="Institute-wide notices. Each one is pinned on the feed for a week and sent to every member."
      />
      <AdminPanel title="New announcement">
        <div className="p-4 sm:p-5">
          <AnnouncementComposer onPublish={publishAnnouncementAction} />
        </div>
      </AdminPanel>
      <AdminPanel title="Published">
        {page.announcements.length === 0 ? (
          <AdminEmpty icon={Megaphone} title="No announcements yet" />
        ) : (
          <ul className="divide-y">
            {page.announcements.map((a) => (
              <li
                key={a.id}
                className="flex items-start justify-between gap-4 px-4 py-3 sm:px-5"
              >
                <div className="min-w-0">
                  <a
                    href={`/feed/${a.id}`}
                    className="font-medium hover:underline"
                  >
                    {a.title}
                  </a>
                  <p className="text-muted-foreground text-sm">
                    {a.author.fullName} ·{" "}
                    <time dateTime={a.createdAt.toISOString()}>
                      {relativeTime(a.createdAt)}
                    </time>
                  </p>
                </div>
                <ConfirmButton
                  label="Remove"
                  title="Remove this announcement?"
                  description="It disappears from the feed. Notifications already sent stay in inboxes."
                  confirmLabel="Remove"
                  fields={{ postId: a.id }}
                  action={removeAnnouncementAction}
                />
              </li>
            ))}
          </ul>
        )}
      </AdminPanel>
      <AdminPager href={nextHref} label="Next" />
    </div>
  );
}
