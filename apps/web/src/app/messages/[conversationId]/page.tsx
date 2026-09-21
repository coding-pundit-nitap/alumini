import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getConversation, listMessages } from "@/composition/messaging";
import { AppError } from "@/lib/errors";
import { getActor } from "@/modules/auth";
import { Thread } from "@/modules/messaging";

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

  return (
    <div className="mx-auto w-full max-w-xl space-y-6 px-4 py-12">
      <Link href="/messages" className="text-primary text-sm underline">
        All messages
      </Link>
      <h1 className="text-2xl font-semibold">{title}</h1>
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
