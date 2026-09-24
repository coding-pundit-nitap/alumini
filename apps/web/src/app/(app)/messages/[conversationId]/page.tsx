import { UserRound, UsersRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { buttonVariants } from "@nitap/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@nitap/ui/components/sheet";

import { listConnections } from "@/composition/connections";
import { getConversation, listMessages } from "@/composition/messaging";
import {
  addParticipantAction,
  removeParticipantAction,
} from "@/app/(app)/messages/actions";
import { AppError } from "@/lib/errors";
import { getActor } from "@/modules/auth";
import { GroupMembers, Thread, ThreadHeader } from "@/modules/messaging";

export const metadata: Metadata = { title: "Conversation" };

const PAGE = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  if (!UUID.test(conversationId)) notFound();
  const actor = await getActor();
  if (!actor)
    redirect(
      `/login?next=${encodeURIComponent(`/messages/${conversationId}`)}`
    );

  let detail;
  let page;
  try {
    [detail, page] = await Promise.all([
      getConversation({ actor, conversationId }),
      listMessages({ actor, conversationId, limit: PAGE }),
    ]);
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    if (error instanceof AppError && error.status === 403)
      redirect("/account/status");
    throw error;
  }

  const candidates =
    detail.isGroup && detail.createdById === actor.userId
      ? (
          await listConnections({ actor, state: "ACCEPTED", limit: 50 })
        ).data.map((c) => c.user)
      : [];
  const other = detail.isGroup
    ? null
    : detail.participants.find((p) => p.id !== actor.userId);
  const ICON = buttonVariants({
    variant: "ghost",
    size: "icon",
    className: "rounded-full",
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ThreadHeader
        conversation={detail}
        viewerId={actor.userId}
        isGroup={detail.isGroup}
        actions={
          detail.isGroup ? (
            <Sheet>
              <SheetTrigger
                render={<button type="button" className={ICON} />}
                aria-label="Members"
              >
                <UsersRound aria-hidden className="size-5" />
              </SheetTrigger>
              <SheetContent className="gap-0 p-0">
                <SheetHeader className="border-b p-4">
                  <SheetTitle>Group info</SheetTitle>
                </SheetHeader>
                <div className="overflow-y-auto p-4">
                  <GroupMembers
                    conversationId={conversationId}
                    viewerId={actor.userId}
                    createdById={detail.createdById}
                    people={detail.participants}
                    candidates={candidates}
                    addAction={addParticipantAction}
                    removeAction={removeParticipantAction}
                  />
                </div>
              </SheetContent>
            </Sheet>
          ) : other ? (
            <Link
              href={`/members/${other.id}`}
              aria-label={`View ${other.fullName}'s profile`}
              className={ICON}
            >
              <UserRound aria-hidden className="size-5" />
            </Link>
          ) : null
        }
      />
      <Thread
        key={conversationId}
        conversationId={conversationId}
        viewerId={actor.userId}
        people={detail.participants}
        title={detail.title}
        isGroup={detail.isGroup}
        initialLastReadSeq={detail.lastReadSeq}
        initialMessages={page.data.map((m) => ({
          ...m,
          createdAt: m.createdAt.toISOString(),
        }))}
        initialNextCursor={page.page.nextCursor}
      />
    </div>
  );
}
