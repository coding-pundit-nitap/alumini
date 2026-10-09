import { PencilLine } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonVariants } from "@nitap/ui/components/button";

import { PageColumns } from "@/components/shell/page-columns";
import { getConnectionStatus } from "@/composition/connections";
import { getProfileForViewer } from "@/composition/users";
import { AppError } from "@/lib/errors";
import { getActor } from "@/modules/auth";
import { ConnectionButton } from "@/modules/connections";
import { MessageButton } from "@/modules/messaging";
import { ProfileCard } from "@/modules/users";
import { loadTicks } from "@/composition/ticks";

import { startConversationAction } from "@/app/(app)/messages/actions";
import {
  blockUserAction,
  removeConnectionAction,
  requestConnectionAction,
  respondToConnectionAction,
} from "@/app/(app)/connections/actions";

export const metadata: Metadata = { title: "Member profile" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MemberPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  if (!UUID.test(userId)) notFound();

  // No redirect for guests: a PUBLIC profile is visible to them, everything else is a 404.
  const actor = await getActor();

  let view;
  try {
    view = await getProfileForViewer({ actor, targetUserId: userId });
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }

  // Only a verified member looking at someone else gets the connect controls.
  const status =
    actor && actor.accountState === "VERIFIED" && actor.userId !== userId
      ? await getConnectionStatus({ actor, otherUserId: userId })
      : null;

  const own = actor?.userId === userId;
  const tick =
    (await loadTicks([userId]).catch(() => null))?.get(userId) ?? null;

  return (
    <PageColumns>
      <ProfileCard
        view={view}
        tick={tick}
        tickHref={own ? "/profile/privacy#tick" : undefined}
        actions={
          own ? (
            <Link
              href="/profile"
              className={buttonVariants({
                variant: "outline",
                size: "sm",
                className: "rounded-full",
              })}
            >
              <PencilLine aria-hidden />
              Edit profile
            </Link>
          ) : status ? (
            <>
              <MessageButton
                recipientId={userId}
                startAction={startConversationAction}
              />
              <ConnectionButton
                targetUserId={userId}
                status={status}
                requestAction={requestConnectionAction}
                respondAction={respondToConnectionAction}
                removeAction={removeConnectionAction}
                blockAction={blockUserAction}
              />
            </>
          ) : null
        }
      />
    </PageColumns>
  );
}
