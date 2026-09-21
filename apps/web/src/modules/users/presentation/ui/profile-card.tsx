import type { ProfileView } from "../../domain/profile";

/** Renders exactly the keys the visibility rule left in the view; a missing key renders nothing. */
export function ProfileCard({ view }: { view: ProfileView }) {
  const { institution } = view;
  return (
    <article className="border-border space-y-4 rounded-lg border p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{view.fullName}</h1>
        {view.headline ? (
          <p className="text-muted-foreground">{view.headline}</p>
        ) : null}
        {view.location ? (
          <p className="text-muted-foreground text-sm">{view.location}</p>
        ) : null}
      </header>

      {institution &&
      (institution.department ||
        institution.degree ||
        institution.graduationYear) ? (
        <p className="text-sm">
          {[institution.degree, institution.department]
            .filter(Boolean)
            .join(", ")}
          {institution.graduationYear
            ? ` · Batch of ${institution.graduationYear}`
            : ""}
        </p>
      ) : null}

      {view.bio ? (
        <section className="space-y-1">
          <h2 className="text-sm font-medium">About</h2>
          <p className="text-sm whitespace-pre-line">{view.bio}</p>
        </section>
      ) : null}
    </article>
  );
}
