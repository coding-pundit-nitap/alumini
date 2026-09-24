import type { ReactNode } from "react";

/** Centre column plus the optional right rail (≥xl). Pages render narrower fallbacks for the aside themselves. */
export function PageColumns({
  children,
  aside,
}: {
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[1000px] gap-8 px-4 py-6 lg:px-8">
      <div className="min-w-0 flex-1 xl:max-w-[640px]">{children}</div>
      {aside ? (
        <aside
          aria-label="Highlights"
          className="hidden w-80 shrink-0 xl:block"
        >
          <div className="sticky top-6 flex flex-col gap-4">{aside}</div>
        </aside>
      ) : null}
    </div>
  );
}
