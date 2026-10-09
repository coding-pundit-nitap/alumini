import { PERMISSIONS, type Permission } from "./permissions.ts";

export const ROLE_NAMES = [
  "STUDENT",
  "ALUMNI",
  "FACULTY",
  "STAFF",
  "MODERATOR",
  "ALUMNI_COORDINATOR",
  "TP_ADMIN",
  "INSTITUTE_ADMIN",
  "SUPER_ADMIN",
] as const;

export type RoleName = (typeof ROLE_NAMES)[number];

/**
 * Roles reachable through self-service onboarding: an institutional email or, later, an
 * approved verification request (2D). The institutional-email policy may name only these, so an admin
 * role can never be configured through an email domain.
 */
export const ONBOARDING_ROLE_NAMES = [
  "STUDENT",
  "ALUMNI",
  "FACULTY",
  "STAFF",
] as const satisfies readonly RoleName[];

/**
 * The role an approved alumni verification request grants. Named here, not in
 * apps/web/src, because application code names permissions, never roles: the web
 * composition root imports this constant and injects it into the use case.
 */
export const VERIFIED_ALUMNI_ROLE = "ALUMNI" as const satisfies RoleName;

/** The role guarded against removal (the last active Super Admin can't be removed); injected into admin use cases. */
export const SUPER_ADMIN_ROLE = "SUPER_ADMIN" as const satisfies RoleName;

const P = PERMISSIONS;

/** Member baseline shared by every role that is a member. */
const MEMBER_BASELINE: Permission[] = [
  P.PROFILE_READ,
  P.PROFILE_UPDATE,
  P.DIRECTORY_SEARCH,
  P.SEARCH_GLOBAL,
  P.CONNECTION_MANAGE,
  P.MESSAGE_SEND,
  P.MENTOR_SEARCH,
  P.JOB_READ,
  P.EVENT_READ,
  P.EVENT_REGISTER,
  P.CHAPTER_JOIN,
  P.POST_CREATE,
  P.POST_INTERACT,
  P.REPORT_CREATE,
  P.DONATION_MAKE,
  P.NOTIFICATION_READ,
];

export const ROLE_PERMISSIONS: Record<RoleName, Permission[]> = {
  STUDENT: [...MEMBER_BASELINE, P.MENTORSHIP_REQUEST],

  ALUMNI: [
    ...MEMBER_BASELINE,
    P.MENTOR_OPT_IN,
    P.MENTORSHIP_RESPOND,
    P.JOB_CREATE,
    P.ACHIEVEMENT_SUBMIT,
  ],

  FACULTY: [...MEMBER_BASELINE, P.ACHIEVEMENT_SUBMIT],

  STAFF: [...MEMBER_BASELINE],

  MODERATOR: [
    ...MEMBER_BASELINE,
    P.USER_READ_ADMIN,
    P.MESSAGE_READ_REPORTED,
    P.POST_MODERATE,
    P.REPORT_REVIEW,
  ],

  ALUMNI_COORDINATOR: [
    ...MEMBER_BASELINE,
    P.PROFILE_READ_ANY,
    P.PROFILE_UPDATE_INSTITUTIONAL,
    P.ALUMNI_VERIFY,
    P.USER_READ_ADMIN,
    P.PERMISSION_GRANT,
    P.EVENT_CREATE,
    P.EVENT_MANAGE,
    P.CHAPTER_CREATE,
    P.CHAPTER_MANAGE,
    P.ANNOUNCEMENT_PUBLISH,
    P.ACHIEVEMENT_REVIEW,
    P.CAMPAIGN_MANAGE,
    P.ANALYTICS_VIEW,
  ],

  TP_ADMIN: [
    ...MEMBER_BASELINE,
    P.JOB_CREATE,
    P.JOB_APPROVE,
    P.JOB_MANAGE,
    P.EVENT_CREATE,
    P.ANALYTICS_VIEW,
  ],

  INSTITUTE_ADMIN: [
    ...MEMBER_BASELINE,
    P.PROFILE_READ_ANY,
    P.PROFILE_UPDATE_INSTITUTIONAL,
    P.ALUMNI_VERIFY,
    P.USER_READ_ADMIN,
    P.USER_SUSPEND,
    P.USER_REACTIVATE,
    P.ROLE_ASSIGN,
    P.PERMISSION_GRANT,
    P.MESSAGE_READ_REPORTED,
    P.JOB_CREATE,
    P.JOB_APPROVE,
    P.JOB_MANAGE,
    P.EVENT_CREATE,
    P.EVENT_MANAGE,
    P.CHAPTER_CREATE,
    P.CHAPTER_MANAGE,
    P.POST_MODERATE,
    P.ANNOUNCEMENT_PUBLISH,
    P.ACHIEVEMENT_REVIEW,
    P.REPORT_REVIEW,
    P.CAMPAIGN_MANAGE,
    P.DONATION_VIEW_ALL,
    P.ANALYTICS_VIEW,
    P.AUDIT_READ,
    P.NOTIFICATION_REPLAY,
  ],

  SUPER_ADMIN: [
    ...MEMBER_BASELINE,
    P.PROFILE_READ_ANY,
    P.PROFILE_UPDATE_INSTITUTIONAL,
    P.ALUMNI_VERIFY,
    P.USER_READ_ADMIN,
    P.USER_SUSPEND,
    P.USER_REACTIVATE,
    P.ROLE_ASSIGN,
    P.PERMISSION_GRANT,
    P.MESSAGE_READ_REPORTED,
    P.JOB_CREATE,
    P.JOB_APPROVE,
    P.JOB_MANAGE,
    P.EVENT_CREATE,
    P.EVENT_MANAGE,
    P.CHAPTER_CREATE,
    P.CHAPTER_MANAGE,
    P.POST_MODERATE,
    P.ANNOUNCEMENT_PUBLISH,
    P.ACHIEVEMENT_REVIEW,
    P.REPORT_REVIEW,
    P.CAMPAIGN_MANAGE,
    P.DONATION_VIEW_ALL,
    P.ANALYTICS_VIEW,
    P.AUDIT_READ,
    P.NOTIFICATION_REPLAY,
    P.SYSTEM_CONFIGURE,
  ],
};
