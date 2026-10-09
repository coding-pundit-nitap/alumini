# UI conventions

## Stack

Server Components by default; Client Components only for interaction. Tailwind CSS 4, with design tokens as
`oklch` CSS variables in `apps/web/src/app/globals.css` (light and dark). Primitives come from `@nitap/ui`
(shadcn on Base UI, lucide icons). Fonts: Instrument Sans and Serif, Geist Mono. TanStack Query handles
lists that load more on the client; the first page always renders on the server.

Module-specific UI lives in `modules/<name>/presentation/ui`; the app shell is in `src/components`.

## Principles

1. **Trust first.** Verification status and who-can-see-what are visible where they matter.
2. **One primary action per screen.** Empty and blocked states say what to do next.
3. **Honest about state.** Never show something the server hasn't confirmed: registrations, approvals and
   payments wait for the response.
4. **Privacy by default.** Never render a field the viewer may not see, and never hint that a hidden profile
   exists: hidden and missing look the same.
5. **The UI is not the security boundary.** Hiding a button is a convenience; the server re-checks every
   action, and screens must cope when it says no.
6. **Phone-first for members**, desktop-first but tablet-safe for admin screens.

## Patterns

- **Page states:** every data screen handles loading (a skeleton matching the layout), empty for first use,
  empty for a filter ("No results" with **Clear filters**), recoverable error (inline, with **Try again**),
  and not-found.
- **Forms:** visible labels; server field errors are mapped back onto their fields; the submit button shows
  progress and is disabled while pending. Server Actions work without JavaScript where possible, and client
  forms use `method="post"` so they never leak values into the URL before hydration.
- **Mutations:** optimistic only for small reversible things (mark read, react), with rollback on failure.
  Anything the server decides waits for the response. Destructive actions confirm and name the consequence;
  audited ones require a reason.
- **Lists:** cursor pagination that loads more as you scroll, with a **Load more** link as the no-JavaScript
  fallback. Filters live in the URL so they can be shared and survive the back button.
- **Copy:** plain and direct ("Waiting for review", not `PENDING_REVIEW`). Errors say what happened and what
  to do, and never show internals. Account-status pages promise no turnaround times.

## Accessibility

WCAG 2.2 AA is the bar:

- semantic landmarks and one `h1` per page;
- full keyboard operation and visible focus;
- contrast of 4.5:1 for text and 3:1 for controls;
- status never shown by colour alone;
- touch targets of at least 44 px on phones;
- live regions for async results and errors;
- `prefers-reduced-motion` honoured.
