import Link from "next/link";
import type { ReactNode } from "react";

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
    <li className="space-y-2 p-4">
      <div className="flex items-start gap-3">
        {mentor.hasPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element -- a presigned, auth-checked route; not a static asset.
          <img
            src={`/api/photos/${mentor.userId}`}
            alt=""
            className="size-10 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-full font-medium"
          >
            {mentor.fullName.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <Link
            href={`/members/${mentor.userId}`}
            className="font-medium underline-offset-2 hover:underline"
          >
            {mentor.fullName}
          </Link>
          {mentor.headline ? (
            <p className="text-muted-foreground text-sm">{mentor.headline}</p>
          ) : null}
          {mentor.department || mentor.currentCompany ? (
            <p className="text-muted-foreground text-sm">
              {[mentor.department, mentor.currentCompany]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}
          <p className="text-sm">{mentor.expertise}</p>
          {mentor.topics.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {mentor.topics.map((topic) => (
                <li
                  key={topic}
                  className="bg-muted rounded-full px-2 py-0.5 text-xs"
                >
                  {topic}
                </li>
              ))}
            </ul>
          ) : null}
          {mentor.spotsLeft > 0 ? (
            <p className="text-sm">
              {mentor.spotsLeft} {mentor.spotsLeft === 1 ? "spot" : "spots"}{" "}
              left
            </p>
          ) : null}
          {mentor.availability ? (
            <p className="text-muted-foreground text-sm">
              {mentor.availability}
            </p>
          ) : null}
        </div>
      </div>
      {requestSlot ? <div>{requestSlot(mentor)}</div> : null}
    </li>
  );
}

/**
 * Mentors a student can browse (FR-MENTOR-003). `requestSlot` renders the request control per row so this
 * list never needs to know about the request use case, which lands in slice 6b.
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
      <p className="text-muted-foreground py-8 text-center">
        No mentors match yet.
      </p>
    );
  }
  return (
    <ul className="divide-border divide-y rounded-lg border">
      {items.map((mentor) => (
        <Row key={mentor.userId} mentor={mentor} requestSlot={requestSlot} />
      ))}
    </ul>
  );
}
