import { Badge } from "@nitap/ui/components/badge";

import type { ReportedMessageView } from "../../application/messaging-store";

/** The moderator's bounded view of a reported message (spec C12-6). Rendering it is the audited access. */
export function ReportedMessageContext({
  view,
}: {
  view: ReportedMessageView;
}) {
  return (
    <section aria-labelledby="context-heading" className="space-y-2">
      <h2 id="context-heading" className="text-lg font-semibold">
        Conversation context
      </h2>
      <p className="text-muted-foreground text-sm">
        The reported message and up to five messages either side. This view is
        recorded in the audit log.
      </p>
      <ol className="space-y-2">
        {view.messages.map((m) => (
          <li
            key={m.id}
            aria-current={m.reported ? "true" : undefined}
            className={
              m.reported
                ? "border-destructive rounded-lg border-2 p-3"
                : "border-border rounded-lg border p-3"
            }
          >
            <p className="text-muted-foreground flex items-center gap-2 text-xs">
              {m.senderName} ·{" "}
              {m.createdAt.toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata",
              })}
              {m.reported ? (
                <Badge variant="destructive">Reported</Badge>
              ) : null}
              {m.hidden ? <Badge variant="outline">Hidden</Badge> : null}
            </p>
            <p className="break-words whitespace-pre-wrap">{m.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
