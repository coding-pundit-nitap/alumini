import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { createGroupAction } from "@/app/(app)/messages/actions";
import { listConnections } from "@/composition/connections";
import { getActor } from "@/modules/auth";
import { GroupForm, PaneHeader } from "@/modules/messaging";

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
    <div className="flex h-full min-h-0 flex-col">
      <PaneHeader
        title="New group"
        subtitle="Start a conversation with several connections"
      />
      <GroupForm candidates={candidates} createAction={createGroupAction} />
    </div>
  );
}
