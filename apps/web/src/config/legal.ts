/**
 * The supporting pages' institute-owned facts (UI/UX §5.1 Open Item 7, TASK.md O-1). The copy in
 * app/terms and app/contact is a draft written from how the app works; the institute approves or replaces
 * it before launch (owner checklist OW-7), then sets `approved` and fills the alumni office's details.
 * Until then each page says it is a draft.
 */
export const legalConfig = {
  approved: false,
  lastUpdated: "2026-10-09",
  /** Each line shows only once the institute has supplied it. */
  alumniOffice: {
    email: null as string | null,
    phone: null as string | null,
    address: null as string | null,
    hours: null as string | null,
  },
};
