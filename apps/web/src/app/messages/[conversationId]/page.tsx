import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { listConnections } from "@/composition/connections";
import { getConversation, listMessages } from "@/composition/messaging";
import {
  addParticipantAction,
  removeParticipantAction,
} from "@/app/messages/actions";
import { AppError } from "@/lib/errors";
import { getActor } from "@/modules/auth";
import { GroupMembers, Thread } from "@/modules/messaging";

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

  const title =
    detail.title ??
    (detail.participants
      .filter((p) => p.id !== actor.userId)
      .map((p) => p.fullName)
      .join(", ") ||
      "Conversation");

  const candidates =
    detail.isGroup && detail.createdById === actor.userId
      ? (
          await listConnections({ actor, state: "ACCEPTED", limit: 50 })
        ).data.map((c) => c.user)
      : [];

  return (
    <div className="mx-auto w-full max-w-xl space-y-6 px-4 py-12">
      <Link href="/messages" className="text-primary text-sm underline">
        All messages
      </Link>
      <h1 className="text-2xl font-semibold">{title}</h1>
      {detail.isGroup ? (
        <GroupMembers
          conversationId={conversationId}
          viewerId={actor.userId}
          createdById={detail.createdById}
          people={detail.participants}
          candidates={candidates}
          addAction={addParticipantAction}
          removeAction={removeParticipantAction}
        />
      ) : null}
      <Thread
        conversationId={conversationId}
        viewerId={actor.userId}
        people={detail.participants}
        initialMessages={page.data.map((m) => ({
          ...m,
          createdAt: m.createdAt.toISOString(),
        }))}
        initialNextCursor={page.page.nextCursor}
      />
    </div>
  );
}
