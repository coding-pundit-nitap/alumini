import { Clock, GraduationCap } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@nitap/ui/components/badge";
import { InitialsAvatar } from "@nitap/ui/components/initials-avatar";
import { TickedAvatar } from "@nitap/ui/components/role-tick";

import type { MentorCard } from "../../application/mentor-ports";

type Mentor = Omit<MentorCard, "sortKey">;

function Row({
  mentor,
  requestSlot,
}: {
  mentor: Mentor;
  requestSlot?: (mentor: Mentor) => ReactNode;
}) {
  return (
    <li className="hover:bg-muted/30 px-4 py-4 transition-colors sm:px-5">
      <div className="flex items-start gap-3">
        <TickedAvatar tick={mentor.tick}>
          <InitialsAvatar
            name={mentor.fullName}
            seed={mentor.userId}
            src={mentor.hasPhoto ? `/api/photos/${mentor.userId}` : null}
            size="lg"
            className="size-11"
          />
        </TickedAvatar>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="leading-tight">
            <Link
              href={`/members/${mentor.userId}`}
              className="font-medium underline-offset-2 hover:underline"
            >
              {mentor.fullName}
            </Link>
            {mentor.headline ? (
              <p className="text-muted-foreground truncate text-sm">
                {mentor.headline}
              </p>
            ) : null}
            {mentor.department || mentor.currentCompany ? (
              <p className="text-muted-foreground mt-0.5 flex items-center gap-1 text-xs">
                <GraduationCap aria-hidden className="size-3.5 shrink-0" />
                <span className="truncate">
                  {[mentor.department, mentor.currentCompany]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </p>
            ) : null}
          </div>
          <p className="text-sm leading-relaxed">{mentor.expertise}</p>
          {mentor.topics.length > 0 ? (
            <ul aria-label="Topics" className="flex flex-wrap gap-1.5">
              {mentor.topics.map((topic) => (
                <li key={topic}>
                  <Link
                    href={`/mentorship?${new URLSearchParams({ tab: "find", topic })}`}
                    className="bg-muted hover:bg-brand/12 hover:text-brand inline-flex h-6 items-center rounded-full px-2.5 text-xs transition-colors"
                  >
                    {topic}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-1">
            {mentor.spotsLeft > 0 ? (
              <Badge variant="success">
                {mentor.spotsLeft} {mentor.spotsLeft === 1 ? "spot" : "spots"}{" "}
                left
              </Badge>
            ) : null}
            {mentor.availability ? (
              <span className="text-muted-foreground inline-flex min-w-0 items-center gap-1 text-xs">
                <Clock aria-hidden className="size-3.5 shrink-0" />
                <span className="truncate">{mentor.availability}</span>
              </span>
            ) : null}
            {requestSlot ? (
              <div className="ml-auto flex items-center">
                {requestSlot(mentor)}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}

/**
 * Mentors a student can browse. `requestSlot` renders the request control per row so this
 * list never needs to know about the request use case.
 */
export function MentorList({
  items,
  requestSlot,
}: {
  items: Mentor[];
  requestSlot?: (mentor: Mentor) => ReactNode;
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <span className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
          <GraduationCap aria-hidden className="size-5" />
        </span>
        <p className="text-muted-foreground max-w-xs text-sm">
          No mentors match yet.
        </p>
      </div>
    );
  }
  return (
    <ul className="divide-border divide-y">
      {items.map((mentor) => (
        <Row key={mentor.userId} mentor={mentor} requestSlot={requestSlot} />
      ))}
    </ul>
  );
}
