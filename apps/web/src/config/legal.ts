/**
 * The supporting pages' institute-owned facts. The copy in
 * app/terms and app/contact is a draft written from how the app works; the institute approves or replaces
 * it before launch (owner checklist), then sets `approved` and fills the alumni office's details.
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
