# Domain model

The schema is the source of truth: [`packages/database/prisma/schema.prisma`](../packages/database/prisma/schema.prisma),
plus constraints written by hand in the migrations. This page explains the parts that aren't obvious from it.
Conventions: UUID ids, `snake_case` columns, `timestamptz` in UTC, money in integer paise.

## Entities by module

| Module        | Tables                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------- |
| auth          | `user`, `session`, `account`, `verification` (Better Auth), `verification_request`                            |
| access        | `role`, `user_role`, `role_permission`, `permission_grant`, `chapter`                                         |
| users         | `profile`, `profile_experience`, `profile_education`, `profile_skill`, `profile_link`, `department`, `degree` |
| uploads       | `upload`                                                                                                      |
| connections   | `connection`                                                                                                  |
| mentorship    | `mentor_profile`, `mentorship`                                                                                |
| messaging     | `conversation`, `conversation_participant`, `message`                                                         |
| posts         | `post`, `comment`, `reaction`                                                                                 |
| achievements  | `achievement`                                                                                                 |
| jobs          | `job`                                                                                                         |
| events        | `event`, `event_registration`                                                                                 |
| moderation    | `report`                                                                                                      |
| notifications | `notification`, `notification_delivery`, `notification_preference`, `email_suppression`                       |
| donations     | `donation_campaign`, `donation`                                                                               |
| platform      | `outbox_event`, `audit_log`, `idempotency_key`, `retention_setting`                                           |

## State machines

Every transition is a guarded `UPDATE … WHERE state = <expected>`; zero rows updated means another request
won, and the use case answers `INVALID_STATE_TRANSITION`.

**Account** (`user.account_state`)

```text
PENDING ──email domain with autoVerify, or approved request──► VERIFIED
PENDING / REJECTED ──rejected request──► REJECTED
VERIFIED ──admin──► SUSPENDED / DEACTIVATED ──admin──► VERIFIED
```

**Verification request**: `PENDING → APPROVED | REJECTED`, decided by a reviewer other than the applicant.
Approval sets `VERIFIED`, grants `ALUMNI` and writes the institutional profile fields, all in one transaction.

**Connection** (one row per unordered pair, `user_a_id < user_b_id`)

```text
(no row) ──request──► PENDING ──recipient accepts──► ACCEPTED
                         └──recipient rejects──► REJECTED   (requester waits 30 days to ask again)
any state ──block──► BLOCKED (the blocker alone can lift it)
cancel / remove / unblock = delete the row; a REJECTED row is never deleted
```

**Mentorship**

```text
REQUESTED ──mentor accepts (capacity checked under lock)──► ACCEPTED ──mentor starts──► ACTIVE ──mentor completes──► COMPLETED
REQUESTED ──mentor declines──► DECLINED
REQUESTED / ACCEPTED / ACTIVE ──cancel──► CANCELLED   (the mentee from any open state; the mentor from ACCEPTED or ACTIVE)
```

Terminal rows are kept as history; asking again creates a new row.

**Job**

```text
create ──► PENDING_REVIEW, or PUBLISHED directly if the poster holds job.approve
PENDING_REVIEW ──approve──► PUBLISHED      ──reject (note required)──► REJECTED ──edit──► PENDING_REVIEW
PUBLISHED ──material edit──► PENDING_REVIEW
PENDING_REVIEW / PUBLISHED ──withdraw (poster or job.manage)──► CLOSED
PUBLISHED ──deadline passed (worker)──► EXPIRED
```

**Event**: `SCHEDULED → CANCELLED`. **Registration**: `REGISTERED → CANCELLED` (frees the seat, re-registering
reuses the row) and, after the start, `REGISTERED → ATTENDED | NO_SHOW`. `event.registered_count` is
changed only by guarded updates that check capacity, the deadline and the status in the same statement.

**Achievement**: `SUBMITTED → PUBLISHED` (creates an `ACHIEVEMENT` post in the same transaction) or
`REJECTED`; `SUBMITTED → WITHDRAWN` by the owner. `UNDER_REVIEW` and `APPROVED` exist in the enum but nothing
sets them yet.

**Report**: `OPEN → UNDER_REVIEW` (optional claim) `→ RESOLVED | DISMISSED`. Resolving soft-deletes the post
or comment, or hides the message. Reports are polymorphic (`target_type`, `target_id`, no foreign key).

**Upload**: `PENDING_UPLOAD → PENDING_SCAN → READY | REJECTED`. Stale `PENDING_UPLOAD` rows are swept.

**Campaign**: `DRAFT → ACTIVE → CLOSED`. **Donation**: `PLEDGED → CONFIRMED | NOT_RECEIVED | CANCELLED`;
pledges with no reference expire to `NOT_RECEIVED` after 30 days.

## Invariants the database enforces

- **Uniqueness:** case-insensitive email; one connection per pair; one open mentorship per pair (partial
  index); one open verification request per user; one registration per user and event; one reaction per
  user and post; one direct conversation per pair; one payment reference per campaign; one report per reporter and target; one notification per
  dedupe key; `(conversation, sender, client_message_id)` for send retries.
- **Checks:** a reviewer is never the applicant; a rejection has a note; timestamps match the state they
  belong to (`responded_at`, `started_at`, `ended_at`); section visibility overrides are never looser than
  the profile level; a `READY` upload's key is under `avatars/`; a chapter grant has a chapter.
- **Append-only:** a trigger rejects `UPDATE`, `DELETE` and `TRUNCATE` on `audit_log`.
- **Counters under lock:** event seats, mentor capacity, group size and per-collection profile item caps
  are checked after locking the owning row.

The database's runtime role (`alumini_app`) can read and write rows but cannot change the schema, and can
only insert into the audit log.
