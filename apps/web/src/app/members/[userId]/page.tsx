import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getProfileForViewer } from "@/composition/users";
import { AppError } from "@/lib/errors";
import { getActor } from "@/modules/auth";
import { ProfileCard } from "@/modules/users";

export const metadata: Metadata = { title: "Member profile" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MemberPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  if (!UUID.test(userId)) notFound();

  // No redirect for guests: a PUBLIC profile is visible to them, everything else is a 404 (RBAC §6 rule 6).
  const actor = await getActor();

  let view;
  try {
    view = await getProfileForViewer({ actor, targetUserId: userId });
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-12">
      <ProfileCard view={view} />
    </div>
  );
}
