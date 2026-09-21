import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { listConversations } from "@/composition/messaging";
import { AppError } from "@/lib/errors";
import { getActor } from "@/modules/auth";
import { ConversationList } from "@/modules/messaging";

export const metadata: Metadata = { title: "Messages" };

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { cursor } = await searchParams;
  const actor = await getActor();
  if (!actor) redirect("/login?next=%2Fmessages");

  let page;
  try {
    page = await listConversations({ actor, cursor });
  } catch (error) {
    if (error instanceof AppError && error.status === 403)
      redirect("/account/status");
    if (error instanceof AppError && error.code === "INVALID_CURSOR")
      redirect("/messages");
    throw error;
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">Messages</h1>
      <ConversationList
        conversations={page.data}
        viewerId={actor.userId}
        nextHref={
          page.page.nextCursor
            ? `/messages?cursor=${encodeURIComponent(page.page.nextCursor)}`
            : null
        }
      />
    </div>
  );
}
