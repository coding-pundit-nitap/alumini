import { MessagesSquare } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonVariants } from "@nitap/ui/components/button";

import { getActor } from "@/modules/auth";

export const metadata: Metadata = { title: "Messages" };

/** The open pane with nothing selected (desktop only; on a phone the inbox fills the screen). */
export default async function MessagesPage() {
  const actor = await getActor();
  if (!actor) redirect("/login?next=%2Fmessages");

  return (
    <div className="bg-muted/20 flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="bg-brand/10 text-brand flex size-16 items-center justify-center rounded-full">
        <MessagesSquare aria-hidden className="size-7" />
      </span>
      <div>
        <p className="text-lg font-semibold tracking-tight">Your messages</p>
        <p className="text-muted-foreground mt-1 max-w-xs text-sm">
          Pick a conversation, message someone from their profile, or start a
          group with your connections.
        </p>
      </div>
      <Link
        href="/messages/new-group"
        className={buttonVariants({
          variant: "brand",
          className: "rounded-full",
        })}
      >
        New group
      </Link>
    </div>
  );
}
