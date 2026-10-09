# Product

A verified network for NIT Arunachal Pradesh: students, alumni, faculty, staff and the institute's
administrators. It is not a replacement for the institute website, ERP, LMS or placement systems, and it is
not a general social network or job board.

## Features

| Area           | What members can do                                                                            |
| -------------- | ---------------------------------------------------------------------------------------------- |
| Onboarding     | Sign up, confirm email, get verified by institutional email or by submitting evidence          |
| Profiles       | Headline, bio, experience, education, skills, links, photo, per-section privacy                |
| Directory      | Search members by name, company, skill, department, year                                       |
| Connections    | Request, accept, reject, remove, block                                                         |
| Mentorship     | Alumni opt in as mentors; students request; mentors accept, start and complete                 |
| Messaging      | 1:1 and group conversations (up to 20), real-time, reportable                                  |
| Feed           | Posts with images and links, comments, reactions, pinned announcements                         |
| Achievements   | Submit for review; approved ones are published to the feed                                     |
| Jobs           | Post jobs and internships; moderated before publishing; expire at the deadline                 |
| Events         | Create events with capacity and deadlines; register; organizers mark attendance                |
| Donations      | Campaigns with offline payment instructions; members pledge, managers confirm receipt          |
| Notifications  | In-app bell and inbox; email per category, with per-domain preferences                         |
| Administration | Verification queue, users, roles and grants, moderation queues, audit log, analytics, settings |

## Roles

Permissions are separate from roles; code checks permissions only. The full matrix is
[`rbac-permission-matrix.md`](../apps/web/tests/support/rbac-permission-matrix.md), checked against the seed by
tests.

| Role                 | Who                      | How it is assigned                                          |
| -------------------- | ------------------------ | ----------------------------------------------------------- |
| `STUDENT`            | Current students         | Institutional email with `autoVerify`                       |
| `ALUMNI`             | Verified former students | Approved verification request                               |
| `FACULTY`, `STAFF`   | Institute employees      | Institutional email, then institute confirmation            |
| `MODERATOR`          | Content moderation       | Assigned by an admin                                        |
| `ALUMNI_COORDINATOR` | Alumni office            | Assigned by an admin; reviews verification and achievements |
| `TP_ADMIN`           | Training and placement   | Assigned by an admin; approves jobs                         |
| `INSTITUTE_ADMIN`    | Institute operations     | Assigned by a super admin                                   |
| `SUPER_ADMIN`        | System administration    | `pnpm admin:bootstrap` for the first; then by a super admin |

Every role includes the member baseline. Permissions can also be granted directly, globally or scoped to a
chapter, optionally with an expiry.

## Account states

| State         | Can do                                                           |
| ------------- | ---------------------------------------------------------------- |
| `PENDING`     | Sign in, edit their basic profile, submit a verification request |
| `VERIFIED`    | Everything their roles and grants allow                          |
| `REJECTED`    | Sign in, see the decision, resubmit (locked after 3 rejections)  |
| `SUSPENDED`   | Sign in and see their status; nothing else                       |
| `DEACTIVATED` | Cannot sign in                                                   |

Only `VERIFIED` accounts have any role or grant in effect, so suspending an admin removes their powers
without touching their grants.

## Rules that protect the system

- **No privilege escalation:** you can grant only what you hold, in a scope you hold. Roles that can assign
  roles need `system.configure` to change.
- **No self-service:** nobody changes their own roles, grants or account state.
- **Separation of duties:** nobody reviews their own verification request, job, achievement or report.
- **Last super admin:** the final active super admin cannot be removed, suspended or deactivated.
- **Existence is hidden:** a resource you may not see answers 404, never 403.
- **Sensitive reads are audited:** opening a private profile with `profile.read_any` and reading a
  reported message both write an audit row.
- **No automatic alumni approval:** a human reviews every evidence submission. Submissions are limited to 3
  per account and 10 per IP per day.

## Audited actions

Written to the append-only audit log in the same transaction as the change: verification decisions,
institutional profile changes, role and grant changes, suspensions and reactivations, job approvals and
rejections, job closures by a manager, moderation decisions (claim, resolve, dismiss, content removal,
message hiding), reads of reported messages, privileged profile reads, achievement reviews,
announcements, campaign and donation changes, setting changes, notification replays, blocks, and denied
attempts on admin permissions.

## Limits

| What                              | Limit                                          |
| --------------------------------- | ---------------------------------------------- |
| API requests per signed-in member | 300 per minute                                 |
| Directory searches                | 60 per minute                                  |
| Connection requests               | 20 per hour; 30-day cooldown after a rejection |
| Mentorship requests               | 10 per hour                                    |
| Messages / new conversations      | 60 per minute / 20 per hour                    |
| Job posts                         | 10 per hour                                    |
| Events created                    | 10 per day                                     |
| Sign-in / sign-up, reset, verify  | 10 per minute / 5 per hour, per IP             |
| Upload size / open uploads        | 5 MB / 5 at a time                             |
| Group conversation                | 20 members                                     |
| Pledge                            | ₹10 to ₹10,00,000                              |

## Retention

Periods are settings an admin changes at `/admin/settings`, within bounds. Read notifications are deleted
after 90 days. Published outbox rows are deleted after 7 days, and idempotency records after 24 hours. Other
categories (audit logs, reports, donation records) are recorded with placeholder periods and are not yet
swept.

## Known gaps

- **Faculty and staff confirmation:** an account on a staff domain waits for confirmation, but there is no
  admin flow for it yet.
- **Institute records:** the verification cross-check has no roster to compare against, so every request
  shows `NOT_CHECKED`.
- **Chapters:** chapter-scoped grants exist, but there are no chapter features.
- **Payments:** donations are pledges with offline payment; there is no payment provider integration.
- **Student to alumni:** a graduating student keeps the `STUDENT` role until an admin changes it.
