import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createGroupAction } from "@/app/(app)/messages/actions";
import { listConnections } from "@/composition/connections";
import { getActor } from "@/modules/auth";
import { GroupForm } from "@/modules/messaging";

export const metadata: Metadata = { title: "New group" };

export default async function NewGroupPage() {
  const actor = await getActor();
  if (!actor) redirect("/login?next=%2Fmessages%2Fnew-group");
  const connections = await listConnections({
    actor,
    state: "ACCEPTED",
    limit: 50,
  });
  const candidates = connections.data.map((c) => c.user);

  return (
    <div className="mx-auto w-full max-w-xl space-y-6 px-4 py-12">
      <Link href="/messages" className="text-primary text-sm underline">
        All messages
      </Link>
      <h1 className="text-2xl font-semibold">New group</h1>
      <GroupForm candidates={candidates} createAction={createGroupAction} />
    </div>
  );
}
