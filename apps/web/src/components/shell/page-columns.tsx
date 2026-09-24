import type { ReactNode } from "react";

/**
 * The framed centre column (hairline sides, optional sticky header) plus the optional right rail (≥xl).
 * Pages render narrower fallbacks for the aside themselves.
 */
export function PageColumns({
  header,
  aside,
  children,
}: {
  header?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={`mx-auto flex w-full max-w-[1040px] ${aside ? "" : "justify-center"}`}
    >
      <div className="min-h-svh min-w-0 flex-1 md:border-x xl:max-w-[640px]">
        {header ? (
          // top-14 clears the mobile bar; the rail replaces it from md up.
          <header className="bg-background/80 sticky top-14 z-10 flex h-14 items-center gap-3 border-b px-4 backdrop-blur-md sm:px-5 md:top-0">
            {header}
          </header>
        ) : null}
        {children}
      </div>
      {aside ? (
        <aside
          aria-label="Highlights"
          className="hidden w-[340px] shrink-0 border-r xl:block"
        >
          <div className="sticky top-0 flex max-h-svh scrollbar-none flex-col gap-7 overflow-y-auto px-6 py-6">
            {aside}
          </div>
        </aside>
      ) : null}
    </div>
  );
}
