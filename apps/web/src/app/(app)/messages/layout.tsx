import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { listConversations } from "@/composition/messaging";
import { AppError } from "@/lib/errors";
import { getActor } from "@/modules/auth";
import { ConversationList, MessengerPanes } from "@/modules/messaging";

/** Keeps the inbox beside the open conversation. */
export default async function MessagesLayout({
  children,
}: {
  children: ReactNode;
}) {
  const actor = await getActor();
  if (!actor) return children;

  let page;
  try {
    page = await listConversations({ actor });
  } catch (error) {
    if (error instanceof AppError && error.status === 403)
      redirect("/account/status");
    throw error;
  }

  return (
    <MessengerPanes
      inbox={
        <ConversationList
          conversations={page.data.map((c) => ({
            ...c,
            lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
          }))}
          viewerId={actor.userId}
          nextCursor={page.page.nextCursor}
        />
      }
    >
      {children}
    </MessengerPanes>
  );
}
