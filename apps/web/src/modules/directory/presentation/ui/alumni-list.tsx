import Link from "next/link";

import type { AlumniSummary } from "../../application/search-directory";

export function AlumniList({ people }: { people: AlumniSummary[] }) {
  if (people.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center">
        No members match these filters.
      </p>
    );
  }
  return (
    <ul className="divide-border divide-y rounded-lg border">
      {people.map((person) => {
        const batch = [person.department, person.graduationYear]
          .filter(Boolean)
          .join(" · ");
        const work = [person.currentDesignation, person.currentCompany]
          .filter(Boolean)
          .join(" at ");
        return (
          <li key={person.id}>
            <Link
              href={`/members/${person.id}`}
              className="hover:bg-muted/50 flex items-center gap-4 p-4"
            >
              {person.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- a presigned, auth-checked route; not a static asset.
                <img
                  src={person.photoUrl}
                  alt=""
                  className="size-12 rounded-full object-cover"
                />
              ) : (
                <span
                  aria-hidden
                  className="bg-muted flex size-12 items-center justify-center rounded-full font-medium"
                >
                  {person.fullName.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="min-w-0 space-y-0.5">
                <span className="block font-medium">{person.fullName}</span>
                {person.headline ? (
                  <span className="text-muted-foreground block truncate text-sm">
                    {person.headline}
                  </span>
                ) : null}
                {work ? <span className="block text-sm">{work}</span> : null}
                <span className="text-muted-foreground block text-xs">
                  {[batch, person.location].filter(Boolean).join(" — ")}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
