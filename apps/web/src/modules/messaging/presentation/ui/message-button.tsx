"use client";

import { Button } from "@nitap/ui/components/button";
import { MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { ActionResult } from "@/lib/action-result";

/** The "Message" control on a member's profile: starts (or reopens) the 1:1 and goes to it. Every rule is re-checked on the server. */
export function MessageButton({
  recipientId,
  startAction,
}: {
  recipientId: string;
  startAction: (
    recipientId: string
  ) => Promise<ActionResult<{ conversationId: string }>>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <Button
        variant="outline"
        size="sm"
        className="rounded-full"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await startAction(recipientId);
            if (result.ok)
              router.push(`/messages/${result.data.conversationId}`);
            else setError(result.error.message);
          });
        }}
      >
        <MessageCircle aria-hidden />
        Message
      </Button>
      {error ? (
        <p role="alert" className="text-destructive mt-2 text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
