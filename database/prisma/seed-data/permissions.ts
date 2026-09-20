/**
 * Single source of truth for permission strings (rbac-permission-matrix.md §3). PostgreSQL cannot
 * validate that a `role_permission.permission` or `permission_grant.permission` value exists here —
 * drift is caught by role-permissions.test.ts instead. Phase 2's authorization code imports this
 * same registry from @nitap/database; it must never define its own copy.
 */
export const PERMISSIONS = {
  // Profile & identity
  PROFILE_READ: "profile.read",
  PROFILE_READ_ANY: "profile.read_any",
  PROFILE_UPDATE: "profile.update",
  PROFILE_UPDATE_INSTITUTIONAL: "profile.update_institutional",
  // Users & access
  ALUMNI_VERIFY: "alumni.verify",
  USER_READ_ADMIN: "user.read_admin",
  USER_SUSPEND: "user.suspend",
  USER_REACTIVATE: "user.reactivate",
  ROLE_ASSIGN: "role.assign",
  PERMISSION_GRANT: "permission.grant",
  // Discovery
  DIRECTORY_SEARCH: "directory.search",
  SEARCH_GLOBAL: "search.global",
  // Networking & messaging
  CONNECTION_MANAGE: "connection.manage",
  MESSAGE_SEND: "message.send",
  MESSAGE_READ_REPORTED: "message.read_reported",
  // Mentorship
  MENTOR_OPT_IN: "mentor.opt_in",
  MENTOR_SEARCH: "mentor.search",
  MENTORSHIP_REQUEST: "mentorship.request",
  MENTORSHIP_RESPOND: "mentorship.respond",
  // Jobs
  JOB_READ: "job.read",
  JOB_CREATE: "job.create",
  JOB_APPROVE: "job.approve",
  JOB_MANAGE: "job.manage",
  // Events & chapters
  EVENT_READ: "event.read",
  EVENT_REGISTER: "event.register",
  EVENT_CREATE: "event.create",
  EVENT_MANAGE: "event.manage",
  CHAPTER_JOIN: "chapter.join",
  CHAPTER_CREATE: "chapter.create",
  CHAPTER_MANAGE: "chapter.manage",
  // Feed & content
  POST_CREATE: "post.create",
  POST_INTERACT: "post.interact",
  POST_MODERATE: "post.moderate",
  ANNOUNCEMENT_PUBLISH: "announcement.publish",
  ACHIEVEMENT_SUBMIT: "achievement.submit",
  ACHIEVEMENT_REVIEW: "achievement.review",
  // Moderation
  REPORT_CREATE: "report.create",
  REPORT_REVIEW: "report.review",
  // Donations
  DONATION_MAKE: "donation.make",
  CAMPAIGN_MANAGE: "campaign.manage",
  DONATION_VIEW_ALL: "donation.view_all",
  // Administration
  ANALYTICS_VIEW: "analytics.view",
  AUDIT_READ: "audit.read",
  SYSTEM_CONFIGURE: "system.configure",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
