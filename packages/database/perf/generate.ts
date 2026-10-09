import { createRandom } from "./random.ts";
import {
  CITIES,
  COMPANIES,
  DESIGNATIONS,
  FIRST_NAMES,
  INDUSTRIES,
  INSTITUTIONS,
  LAST_NAMES,
  paragraph,
  SKILLS,
  TOPICS,
} from "./words.ts";

/** Deterministic: the same options always produce the same rows. */
export type PerfOptions = {
  /** Member accounts (staff accounts come on top: 1 super admin, 3 coordinators, 5 moderators). */
  users: number;
  seed: number;
  /** Anchor for every relative date: upcoming events, live jobs and recent posts stay current. */
  now: Date;
  /** Load users that get a pre-minted session. */
  sessions: number;
  /** Capacity of the event the registration spike targets; it starts with no registrations. */
  spikeCapacity: number;
};

export type PerfReference = {
  departments: readonly { id: string; code: string }[];
  degrees: readonly { id: string; code: string }[];
  /** Role name → role id, from the base seed. */
  roleIds: Readonly<Record<string, string>>;
};

export type Value = string | number | boolean | null;

/** One table's rows. `columns` pairs a column with the SQL type its text value is cast to on insert. */
export type TableRows = {
  table: string;
  columns: readonly (readonly [name: string, type: string])[];
  rows: Value[][];
};

export type PerfFixture = {
  options: { users: number; seed: number; now: string; sessions: number };
  /** Members with a session row; the cookie is signed by the caller, who holds the secret. */
  loadUsers: { userId: string; email: string; token: string }[];
  /** Direct and group conversations each load user takes part in. */
  conversationsByUser: Record<string, string[]>;
  spikeEvent: { id: string; capacity: number };
  upcomingEventIds: string[];
  publishedJobIds: string[];
  /** Members whose profile any verified member may open (PUBLIC or MEMBERS_ONLY). */
  profileUserIds: string[];
  /** Verified members for the sign-in scenario; every seeded account shares one password. */
  signInEmails: string[];
  searchTerms: string[];
  departmentCodes: string[];
};

export type PerfData = { tables: TableRows[]; fixture: PerfFixture };

type Visibility = "PUBLIC" | "MEMBERS_ONLY" | "CONNECTIONS_ONLY" | "PRIVATE";
const VISIBILITY_ORDER: Visibility[] = [
  "PUBLIC",
  "MEMBERS_ONLY",
  "CONNECTIONS_ONLY",
  "PRIVATE",
];

type Member = {
  id: string;
  email: string;
  name: string;
  role: string;
  state: string;
  departmentId: string | null;
  gradYear: number | null;
  visibility: Visibility;
  staff: boolean;
};

const DAY = 86_400_000;
/** Placeholder the generator puts in `account.password`; the writer swaps in the real hash. */
export const PASSWORD_PLACEHOLDER = "$PASSWORD_HASH";

function table(
  name: string,
  columns: readonly (readonly [string, string])[]
): TableRows & { add: (...values: Value[]) => void } {
  const rows: Value[][] = [];
  return {
    table: name,
    columns,
    rows,
    add: (...values) => {
      rows.push(values);
    },
  };
}

export function generatePerfData(
  options: PerfOptions,
  reference: PerfReference
): PerfData {
  const rng = createRandom(options.seed);
  const now = options.now.getTime();
  const at = (ms: number) => new Date(ms).toISOString();
  const daysAgo = (days: number) => at(now - days * DAY);
  const dateOnly = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const scale = (ratio: number) =>
    Math.max(1, Math.round(options.users * ratio));
  const nowYear = options.now.getUTCFullYear();

  const users = table("user", [
    ["id", "uuid"],
    ["name", "text"],
    ["email", "text"],
    ["email_verified", "boolean"],
    ["account_state", '"AccountState"'],
    ["created_at", "timestamptz"],
    ["updated_at", "timestamptz"],
  ]);
  const accounts = table("account", [
    ["id", "uuid"],
    ["account_id", "text"],
    ["provider_id", "text"],
    ["user_id", "uuid"],
    ["password", "text"],
    ["created_at", "timestamptz"],
    ["updated_at", "timestamptz"],
  ]);
  const userRoles = table("user_role", [
    ["id", "uuid"],
    ["user_id", "uuid"],
    ["role_id", "uuid"],
    ["granted_by", "uuid"],
    ["granted_at", "timestamptz"],
  ]);
  const profiles = table("profile", [
    ["user_id", "uuid"],
    ["full_name", "text"],
    ["headline", "text"],
    ["bio", "text"],
    ["department_id", "uuid"],
    ["degree_id", "uuid"],
    ["graduation_year", "int"],
    ["location", "text"],
    ["visibility", '"ProfileVisibility"'],
    ["location_visibility", '"ProfileVisibility"'],
    ["experience_visibility", '"ProfileVisibility"'],
    ["created_at", "timestamptz"],
    ["updated_at", "timestamptz"],
  ]);
  const experience = table("profile_experience", [
    ["id", "uuid"],
    ["user_id", "uuid"],
    ["company", "text"],
    ["industry", "text"],
    ["designation", "text"],
    ["start_date", "date"],
    ["end_date", "date"],
    ["is_current", "boolean"],
    ["created_at", "timestamptz"],
    ["updated_at", "timestamptz"],
  ]);
  const education = table("profile_education", [
    ["id", "uuid"],
    ["user_id", "uuid"],
    ["institution", "text"],
    ["qualification", "text"],
    ["field_of_study", "text"],
    ["start_year", "int"],
    ["end_year", "int"],
    ["created_at", "timestamptz"],
    ["updated_at", "timestamptz"],
  ]);
  const skills = table("profile_skill", [
    ["id", "uuid"],
    ["user_id", "uuid"],
    ["skill", "text"],
    ["created_at", "timestamptz"],
    ["updated_at", "timestamptz"],
  ]);
  const links = table("profile_link", [
    ["id", "uuid"],
    ["user_id", "uuid"],
    ["type", '"ProfileLinkType"'],
    ["url", "text"],
    ["created_at", "timestamptz"],
    ["updated_at", "timestamptz"],
  ]);

  // ---- Accounts and profiles -------------------------------------------------------------------------
  const members: Member[] = [];
  const addAccount = (member: Member, createdAt: string) => {
    members.push(member);
    users.add(
      member.id,
      member.name,
      member.email,
      true,
      member.state,
      createdAt,
      createdAt
    );
    accounts.add(
      rng.uuid(),
      member.id,
      "credential",
      member.id,
      PASSWORD_PLACEHOLDER,
      createdAt,
      createdAt
    );
  };

  const staffRoles: [string, number][] = [
    ["SUPER_ADMIN", 1],
    ["ALUMNI_COORDINATOR", 3],
    ["MODERATOR", 5],
  ];
  for (const [role, count] of staffRoles) {
    for (let i = 1; i <= count; i += 1) {
      const slug = role.toLowerCase().replace(/_/g, "-");
      addAccount(
        {
          id: rng.uuid(),
          email: `perf-${slug}-${i}@perf.example.test`,
          name: `Perf ${role.replace(/_/g, " ").toLowerCase()} ${i}`,
          role,
          state: "VERIFIED",
          departmentId: null,
          gradYear: null,
          visibility: "MEMBERS_ONLY",
          staff: true,
        },
        daysAgo(800)
      );
    }
  }
  const superAdmin = members[0]!;
  const reviewers = members.filter((m) => m.role !== "SUPER_ADMIN");

  for (let i = 1; i <= options.users; i += 1) {
    const first = rng.pick(FIRST_NAMES);
    const last = rng.pick(LAST_NAMES);
    const role = rng.weighted([
      ["ALUMNI", 72],
      ["STUDENT", 18],
      ["FACULTY", 6],
      ["STAFF", 4],
    ] as const);
    const gradYear =
      role === "ALUMNI"
        ? Math.min(
            nowYear - 1,
            2010 + Math.floor(Math.sqrt(rng.next()) * (nowYear - 2010))
          )
        : role === "STUDENT"
          ? rng.int(nowYear + 1, nowYear + 4)
          : null;
    const academic = role === "ALUMNI" || role === "STUDENT";
    addAccount(
      {
        id: rng.uuid(),
        email: `perf.${first}.${last}.${i}@perf.example.test`.toLowerCase(),
        name: `${first} ${last}`,
        role,
        state: rng.weighted([
          ["VERIFIED", 94],
          ["PENDING", 4],
          ["SUSPENDED", 1],
          ["DEACTIVATED", 1],
        ] as const),
        departmentId:
          academic || rng.chance(0.7)
            ? rng.pick(reference.departments).id
            : null,
        gradYear,
        visibility: rng.weighted([
          ["PUBLIC", 20],
          ["MEMBERS_ONLY", 60],
          ["CONNECTIONS_ONLY", 15],
          ["PRIVATE", 5],
        ] as const),
        staff: false,
      },
      daysAgo(rng.int(1, 720))
    );
  }

  const degreeId = (code: string) =>
    reference.degrees.find((d) => d.code === code)?.id ??
    reference.degrees[0]!.id;
  const stricter = (base: Visibility): Visibility =>
    VISIBILITY_ORDER[
      Math.min(3, VISIBILITY_ORDER.indexOf(base) + rng.int(0, 2))
    ]!;

  for (const member of members) {
    const roleId = reference.roleIds[member.role];
    if (!roleId) throw new Error(`Role ${member.role} is not seeded`);
    const createdAt = daysAgo(rng.int(1, 700));
    userRoles.add(
      rng.uuid(),
      member.id,
      roleId,
      member.staff ? member.id : superAdmin.id,
      createdAt
    );

    const alumni = member.role === "ALUMNI";
    const jobs = alumni
      ? rng.weighted([
          [0, 15],
          [1, 30],
          [2, 30],
          [3, 15],
          [4, 10],
        ] as const)
      : 0;
    let current: { company: string; designation: string } | null = null;
    let cursor = now - rng.int(30, 4 * 365) * DAY;
    for (let j = 0; j < jobs; j += 1) {
      const company = rng.pick(COMPANIES);
      const designation = rng.pick(DESIGNATIONS);
      const isCurrent = j === 0 && rng.chance(0.85);
      const start = cursor;
      const end = isCurrent
        ? null
        : Math.min(now - DAY, start + rng.int(180, 3 * 365) * DAY);
      if (isCurrent) current = { company, designation };
      experience.add(
        rng.uuid(),
        member.id,
        company,
        rng.pick(INDUSTRIES),
        designation,
        dateOnly(start),
        end === null ? null : dateOnly(end),
        isCurrent,
        createdAt,
        createdAt
      );
      cursor = start - rng.int(200, 3 * 365) * DAY;
    }

    const headline = member.staff
      ? "Alumni office, NIT Arunachal Pradesh"
      : current
        ? `${current.designation} at ${current.company}`
        : member.role === "STUDENT"
          ? "B.Tech student, NIT Arunachal Pradesh"
          : rng.chance(0.6)
            ? rng.pick(DESIGNATIONS)
            : null;
    profiles.add(
      member.id,
      member.name,
      headline,
      rng.chance(0.4) ? paragraph(rng.pick, rng.int(1, 3)) : null,
      member.departmentId,
      member.gradYear === null
        ? null
        : degreeId(
            rng.weighted([
              ["BTECH", 80],
              ["MTECH", 15],
              ["PHD", 5],
            ] as const)
          ),
      member.gradYear,
      rng.chance(0.85) ? rng.pick(CITIES) : null,
      member.visibility,
      rng.chance(0.1) ? stricter(member.visibility) : null,
      rng.chance(0.1) ? stricter(member.visibility) : null,
      createdAt,
      createdAt
    );

    if (!member.staff) {
      for (const skill of rng.sample(SKILLS, rng.int(2, 8))) {
        skills.add(rng.uuid(), member.id, skill, createdAt, createdAt);
      }
    }
    if (alumni && rng.chance(0.2)) {
      const startYear = rng.int(2008, nowYear - 1);
      education.add(
        rng.uuid(),
        member.id,
        rng.pick(INSTITUTIONS),
        rng.pick(["M.Tech", "MBA", "M.S.", "Ph.D."]),
        rng.pick([
          "Computer Science",
          "Power Systems",
          "Management",
          "Structural Engineering",
        ]),
        startYear,
        rng.chance(0.8) ? Math.min(nowYear, startYear + rng.int(1, 5)) : null,
        createdAt,
        createdAt
      );
    }
    if (rng.chance(0.5)) {
      links.add(
        rng.uuid(),
        member.id,
        "LINKEDIN",
        `https://www.linkedin.com/in/${member.id}`,
        createdAt,
        createdAt
      );
    }
    if (rng.chance(0.2)) {
      links.add(
        rng.uuid(),
        member.id,
        "GITHUB",
        `https://github.com/perf-${member.id.slice(0, 8)}`,
        createdAt,
        createdAt
      );
    }
  }

  // Everything social happens between verified, non-staff members.
  const active = members.filter((m) => !m.staff && m.state === "VERIFIED");
  const alumniActive = active.filter((m) => m.role === "ALUMNI");

  // ---- Connections: a heavy-tailed degree distribution, mostly within a cohort -----------------------
  const connections = table("connection", [
    ["id", "uuid"],
    ["user_a_id", "uuid"],
    ["user_b_id", "uuid"],
    ["requested_by_id", "uuid"],
    ["blocked_by_id", "uuid"],
    ["state", '"ConnectionState"'],
    ["requested_at", "timestamptz"],
    ["responded_at", "timestamptz"],
  ]);
  const byCohort = [...active].sort(
    (a, b) =>
      (a.departmentId ?? "").localeCompare(b.departmentId ?? "") ||
      (a.gradYear ?? 0) - (b.gradYear ?? 0)
  );
  const pairs = new Set<string>();
  const accepted: [string, string][] = [];
  byCohort.forEach((member, index) => {
    // Pareto(x_m = 5, alpha = 2): mean 10 requests made, so a mean degree near 20, capped at 200.
    const wanted = Math.min(200, Math.floor(5 / Math.sqrt(1 - rng.next())));
    for (let k = 0; k < wanted; k += 1) {
      const other = rng.chance(0.65)
        ? byCohort[
            Math.min(
              byCohort.length - 1,
              Math.max(0, index + rng.int(-150, 150))
            )
          ]!
        : rng.pick(byCohort);
      if (other.id === member.id) continue;
      const [a, b] =
        member.id < other.id ? [member.id, other.id] : [other.id, member.id];
      const key = `${a}:${b}`;
      if (pairs.has(key)) continue;
      pairs.add(key);
      const state = rng.weighted([
        ["ACCEPTED", 85],
        ["PENDING", 11],
        ["REJECTED", 3],
        ["BLOCKED", 1],
      ] as const);
      const requestedAt = now - rng.int(1, 700) * DAY;
      connections.add(
        rng.uuid(),
        a,
        b,
        member.id,
        state === "BLOCKED" ? rng.pick([a, b]) : null,
        state,
        at(requestedAt),
        state === "ACCEPTED" || state === "REJECTED"
          ? at(requestedAt + rng.int(1, 72) * 3_600_000)
          : null
      );
      if (state === "ACCEPTED") accepted.push([a, b]);
    }
  });

  // ---- Mentorship ----------------------------------------------------------------------------------------
  const mentorProfiles = table("mentor_profile", [
    ["user_id", "uuid"],
    ["expertise", "text"],
    ["topics", "text[]"],
    ["availability", "text"],
    ["preferred_contact_method", '"MentorContactMethod"'],
    ["max_mentees", "int"],
    ["accepting", "boolean"],
    ["created_at", "timestamptz"],
    ["updated_at", "timestamptz"],
  ]);
  const mentorships = table("mentorship", [
    ["id", "uuid"],
    ["mentor_id", "uuid"],
    ["mentee_id", "uuid"],
    ["state", '"MentorshipState"'],
    ["topic", "text"],
    ["message", "text"],
    ["requested_at", "timestamptz"],
    ["responded_at", "timestamptz"],
    ["started_at", "timestamptz"],
    ["ended_at", "timestamptz"],
    ["updated_at", "timestamptz"],
  ]);
  const mentors = alumniActive.filter(
    (m) => (m.gradYear ?? nowYear) <= nowYear - 3 && rng.chance(0.1)
  );
  const mentorIds = new Set(mentors.map((m) => m.id));
  for (const mentor of mentors) {
    const createdAt = daysAgo(rng.int(1, 500));
    mentorProfiles.add(
      mentor.id,
      paragraph(rng.pick, 1),
      `{${rng.sample(TOPICS, rng.int(1, 4)).join(",")}}`,
      rng.pick(["Weekends", "Weekday evenings", "Once a month", ""]),
      rng.pick(["IN_APP", "EMAIL", "VIDEO_CALL", "PHONE"]),
      rng.int(1, 6),
      rng.chance(0.8),
      createdAt,
      createdAt
    );
  }
  const mentees = active.filter((m) => !mentorIds.has(m.id));
  const mentorPairs = new Set<string>();
  for (let i = 0; i < scale(0.15) && mentors.length > 0; i += 1) {
    const mentor = rng.pick(mentors);
    const mentee = rng.pick(mentees);
    const key = `${mentor.id}:${mentee.id}`;
    if (mentorPairs.has(key)) continue;
    mentorPairs.add(key);
    const state = rng.weighted([
      ["REQUESTED", 15],
      ["ACCEPTED", 5],
      ["ACTIVE", 25],
      ["COMPLETED", 30],
      ["DECLINED", 15],
      ["CANCELLED", 10],
    ] as const);
    const requested = now - rng.int(5, 400) * DAY;
    const responded = ["ACCEPTED", "ACTIVE", "COMPLETED", "DECLINED"].includes(
      state
    )
      ? requested + DAY
      : null;
    const started =
      state === "ACTIVE" || state === "COMPLETED" ? requested + 2 * DAY : null;
    const ended = ["COMPLETED", "DECLINED", "CANCELLED"].includes(state)
      ? requested + 3 * DAY
      : null;
    mentorships.add(
      rng.uuid(),
      mentor.id,
      mentee.id,
      state,
      rng.pick(TOPICS),
      "Would you be open to mentoring me on this?",
      at(requested),
      responded === null ? null : at(responded),
      started === null ? null : at(started),
      ended === null ? null : at(ended),
      at(ended ?? started ?? responded ?? requested)
    );
  }

  // ---- Jobs ----------------------------------------------------------------------------------------------
  const jobs = table("job", [
    ["id", "uuid"],
    ["posted_by", "uuid"],
    ["title", "text"],
    ["company", "text"],
    ["description", "text"],
    ["employment_type", '"EmploymentType"'],
    ["location", "text"],
    ["work_mode", '"WorkMode"'],
    ["experience", "text"],
    ["skills", "text[]"],
    ["application_url", "text"],
    ["deadline", "date"],
    ["status", '"JobStatus"'],
    ["reviewed_by", "uuid"],
    ["reviewed_at", "timestamptz"],
    ["review_note", "text"],
    ["created_at", "timestamptz"],
    ["updated_at", "timestamptz"],
  ]);
  const publishedJobIds: string[] = [];
  for (let i = 0; i < scale(0.15); i += 1) {
    const id = rng.uuid();
    const status = rng.weighted([
      ["PUBLISHED", 65],
      ["PENDING_REVIEW", 10],
      ["EXPIRED", 15],
      ["CLOSED", 7],
      ["REJECTED", 3],
    ] as const);
    const created = now - rng.int(1, 300) * DAY;
    const deadline =
      status === "PUBLISHED" || status === "PENDING_REVIEW"
        ? now + rng.int(5, 90) * DAY
        : status === "EXPIRED"
          ? now - rng.int(1, 200) * DAY
          : created + rng.int(10, 60) * DAY;
    const reviewed = status !== "PENDING_REVIEW";
    if (status === "PUBLISHED") publishedJobIds.push(id);
    jobs.add(
      id,
      rng.pick(alumniActive.length > 0 ? alumniActive : active).id,
      rng.pick(DESIGNATIONS),
      rng.pick(COMPANIES),
      paragraph(rng.pick, rng.int(2, 6)),
      rng.pick([
        "FULL_TIME",
        "FULL_TIME",
        "INTERNSHIP",
        "CONTRACT",
        "PART_TIME",
      ]),
      rng.pick(CITIES),
      rng.pick(["ONSITE", "REMOTE", "HYBRID"]),
      rng.pick(["0-2 years", "2-5 years", "5+ years", "Freshers"]),
      `{${rng
        .sample(SKILLS, rng.int(2, 5))
        .map((s) => `"${s}"`)
        .join(",")}}`,
      `https://careers.example.test/jobs/${id}`,
      dateOnly(deadline),
      status,
      reviewed ? rng.pick(reviewers).id : null,
      reviewed ? at(created + DAY) : null,
      status === "REJECTED"
        ? "Please add the salary range and location."
        : null,
      at(created),
      at(reviewed ? created + DAY : created)
    );
  }

  // ---- Events --------------------------------------------------------------------------------------------
  const events = table("event", [
    ["id", "uuid"],
    ["organizer_id", "uuid"],
    ["title", "text"],
    ["description", "text"],
    ["starts_at", "timestamptz"],
    ["timezone", "text"],
    ["location", "text"],
    ["is_online", "boolean"],
    ["capacity", "int"],
    ["registered_count", "int"],
    ["registration_deadline", "timestamptz"],
    ["status", '"EventStatus"'],
    ["cancelled_at", "timestamptz"],
    ["created_at", "timestamptz"],
    ["updated_at", "timestamptz"],
  ]);
  const registrations = table("event_registration", [
    ["id", "uuid"],
    ["event_id", "uuid"],
    ["user_id", "uuid"],
    ["state", '"EventRegistrationState"'],
    ["registered_at", "timestamptz"],
    ["updated_at", "timestamptz"],
  ]);
  const organizers = [
    ...reviewers,
    ...active.filter((m) => m.role === "FACULTY" || m.role === "STAFF"),
  ];
  const upcomingEventIds: string[] = [];
  const addEvent = (input: {
    id: string;
    startsAt: number;
    capacity: number;
    cancelled: boolean;
    registrants: number;
    title: string;
  }) => {
    const created = Math.min(now - DAY, input.startsAt - rng.int(10, 60) * DAY);
    const online = rng.chance(0.3);
    let registered = 0;
    for (const user of rng.sample(active, input.registrants)) {
      const state = rng.chance(0.05) ? "CANCELLED" : "REGISTERED";
      if (state === "REGISTERED") registered += 1;
      const when = at(created + rng.int(1, 9) * DAY);
      registrations.add(rng.uuid(), input.id, user.id, state, when, when);
    }
    events.add(
      input.id,
      rng.pick(organizers).id,
      input.title,
      paragraph(rng.pick, rng.int(2, 5)),
      at(input.startsAt),
      "Asia/Kolkata",
      online ? null : "Main Auditorium, NIT Arunachal Pradesh, Jote",
      online,
      input.capacity,
      registered,
      at(input.startsAt - DAY),
      input.cancelled ? "CANCELLED" : "SCHEDULED",
      input.cancelled ? at(input.startsAt - 3 * DAY) : null,
      at(created),
      at(created)
    );
  };
  for (let i = 0; i < scale(0.03); i += 1) {
    const upcoming = rng.chance(0.6);
    const id = rng.uuid();
    const capacity = rng.int(30, 400);
    const cancelled = rng.chance(0.05);
    if (upcoming && !cancelled) upcomingEventIds.push(id);
    addEvent({
      id,
      startsAt: upcoming
        ? now + rng.int(2, 120) * DAY
        : now - rng.int(1, 365) * DAY,
      capacity,
      cancelled,
      registrants: rng.int(0, Math.floor(capacity * 0.9)),
      title: `${rng.pick(["Alumni meet", "Tech talk", "Career workshop", "Webinar", "Reunion"])} ${i + 1}`,
    });
  }
  const spikeEvent = { id: rng.uuid(), capacity: options.spikeCapacity };
  addEvent({
    id: spikeEvent.id,
    startsAt: now + 30 * DAY,
    capacity: spikeEvent.capacity,
    cancelled: false,
    registrants: 0,
    title: "Registration spike target",
  });

  // ---- Posts, achievements, comments, reactions ---------------------------------------------------------
  const posts = table("post", [
    ["id", "uuid"],
    ["author_id", "uuid"],
    ["content", "text"],
    ["title", "text"],
    ["image_urls", "text[]"],
    ["link_url", "text"],
    ["post_type", '"PostType"'],
    ["deleted", "boolean"],
    ["created_at", "timestamptz"],
  ]);
  const achievements = table("achievement", [
    ["id", "uuid"],
    ["user_id", "uuid"],
    ["title", "text"],
    ["description", "text"],
    ["category", '"AchievementCategory"'],
    ["status", '"AchievementStatus"'],
    ["reviewed_by_id", "uuid"],
    ["published_post_id", "uuid"],
    ["created_at", "timestamptz"],
    ["updated_at", "timestamptz"],
  ]);
  const postTimes: { id: string; at: number }[] = [];
  // A fifth of the members write most posts, as on any network.
  const writers = rng.sample(active, Math.ceil(active.length / 5));
  for (let i = 0; i < scale(3); i += 1) {
    const id = rng.uuid();
    const created = now - Math.floor(365 * DAY * rng.next() ** 1.5) - 60_000;
    const announcement = rng.chance(0.005);
    postTimes.push({ id, at: created });
    posts.add(
      id,
      announcement
        ? superAdmin.id
        : rng.chance(0.8)
          ? rng.pick(writers).id
          : rng.pick(active).id,
      paragraph(rng.pick, rng.int(1, 4)),
      announcement ? "Notice from the alumni office" : null,
      "{}",
      rng.chance(0.1) ? "https://www.nitap.ac.in/" : null,
      announcement ? "ANNOUNCEMENT" : "TEXT",
      rng.chance(0.02),
      at(created)
    );
  }
  for (let i = 0; i < scale(0.05); i += 1) {
    const owner = rng.pick(alumniActive.length > 0 ? alumniActive : active);
    const status = rng.weighted([
      ["SUBMITTED", 20],
      ["UNDER_REVIEW", 10],
      ["APPROVED", 5],
      ["PUBLISHED", 50],
      ["REJECTED", 10],
      ["WITHDRAWN", 5],
    ] as const);
    const created = now - rng.int(2, 300) * DAY;
    const title = rng.pick([
      "Best paper award",
      "Promoted to lead",
      "Cleared GATE",
      "Founded a startup",
      "Published a book",
    ]);
    const description = paragraph(rng.pick, 2);
    let postId: string | null = null;
    if (status === "PUBLISHED") {
      postId = rng.uuid();
      postTimes.push({ id: postId, at: created + DAY });
      posts.add(
        postId,
        owner.id,
        `${title}. ${description}`,
        null,
        "{}",
        null,
        "ACHIEVEMENT",
        false,
        at(created + DAY)
      );
    }
    achievements.add(
      rng.uuid(),
      owner.id,
      title,
      description,
      rng.pick([
        "AWARD",
        "PUBLICATION",
        "PROMOTION",
        "CERTIFICATION",
        "ENTREPRENEURSHIP",
        "OTHER",
      ]),
      status,
      status === "SUBMITTED" || status === "WITHDRAWN"
        ? null
        : rng.pick(reviewers).id,
      postId,
      at(created),
      at(created + DAY)
    );
  }
  postTimes.sort((a, b) => b.at - a.at);
  // Newer posts draw most of the activity.
  const recentPost = () =>
    postTimes[Math.floor(postTimes.length * rng.next() ** 2)]!;

  const comments = table("comment", [
    ["id", "uuid"],
    ["post_id", "uuid"],
    ["author_id", "uuid"],
    ["body", "text"],
    ["deleted", "boolean"],
    ["created_at", "timestamptz"],
  ]);
  for (let i = 0; i < scale(6); i += 1) {
    const post = recentPost();
    comments.add(
      rng.uuid(),
      post.id,
      rng.pick(active).id,
      paragraph(rng.pick, 1),
      rng.chance(0.01),
      at(Math.min(now - 1000, post.at + rng.int(1, 72 * 60) * 60_000))
    );
  }
  const reactions = table("reaction", [
    ["id", "uuid"],
    ["post_id", "uuid"],
    ["user_id", "uuid"],
    ["type", "text"],
    ["created_at", "timestamptz"],
  ]);
  const reacted = new Set<string>();
  for (let i = 0; i < scale(12); i += 1) {
    const post = recentPost();
    const user = rng.pick(active);
    const key = `${post.id}:${user.id}`;
    if (reacted.has(key)) continue;
    reacted.add(key);
    reactions.add(
      rng.uuid(),
      post.id,
      user.id,
      rng.weighted([
        ["LIKE", 60],
        ["CELEBRATE", 20],
        ["SUPPORT", 12],
        ["INSIGHTFUL", 8],
      ] as const),
      at(Math.min(now - 1000, post.at + rng.int(1, 48 * 60) * 60_000))
    );
  }

  // ---- Messaging -----------------------------------------------------------------------------------------
  const conversations = table("conversation", [
    ["id", "uuid"],
    ["created_by_id", "uuid"],
    ["is_group", "boolean"],
    ["title", "text"],
    ["direct_pair_key", "text"],
    ["last_message_seq", "bigint"],
    ["last_message_at", "timestamptz"],
    ["created_at", "timestamptz"],
  ]);
  const participants = table("conversation_participant", [
    ["conversation_id", "uuid"],
    ["user_id", "uuid"],
    ["joined_at", "timestamptz"],
    ["last_read_seq", "bigint"],
    ["unread_count", "int"],
  ]);
  const messages = table("message", [
    ["id", "uuid"],
    ["seq", "bigint"],
    ["conversation_id", "uuid"],
    ["sender_id", "uuid"],
    ["body", "text"],
    ["client_message_id", "uuid"],
    ["created_at", "timestamptz"],
  ]);
  type Thread = {
    id: string;
    members: string[];
    group: string | null;
    created: number;
    messages: { id: string; sender: string; at: number; seq: number }[];
  };
  const threads: Thread[] = [];
  const newThread = (
    members: string[],
    group: string | null,
    count: number
  ) => {
    const created = now - rng.int(1, 180) * DAY;
    const thread: Thread = {
      id: rng.uuid(),
      members,
      group,
      created,
      messages: [],
    };
    let t = created;
    for (let i = 0; i < count; i += 1) {
      t = Math.min(now - 1000, t + rng.int(1, 600) * 60_000);
      thread.messages.push({
        id: rng.uuid(),
        sender: rng.pick(members),
        at: t,
        seq: 0,
      });
    }
    threads.push(thread);
  };
  for (const [a, b] of rng.sample(accepted, scale(2))) {
    newThread(
      [a, b],
      null,
      rng.weighted([
        [rng.int(1, 3), 30],
        [rng.int(4, 10), 40],
        [rng.int(11, 30), 25],
        [rng.int(31, 80), 5],
      ])
    );
  }
  for (let i = 0; i < scale(0.02); i += 1) {
    newThread(
      rng.sample(active, rng.int(3, 12)).map((m) => m.id),
      `${rng.pick(["Batch", "Project", "Chapter", "Reunion"])} group ${i + 1}`,
      rng.int(10, 150)
    );
  }
  // seq is one global, time-ordered sequence, as BIGSERIAL assigns it.
  const allMessages = threads.flatMap((thread) =>
    thread.messages.map((message) => ({ thread, message }))
  );
  allMessages.sort((x, y) => x.message.at - y.message.at);
  allMessages.forEach(({ message }, index) => {
    message.seq = index + 1;
  });
  const conversationsByUser = new Map<string, string[]>();
  for (const thread of threads) {
    const last = thread.messages.at(-1);
    const [a, b] = [...thread.members].sort();
    conversations.add(
      thread.id,
      thread.members[0]!,
      thread.group !== null,
      thread.group,
      thread.group === null ? `${a}:${b}` : null,
      last?.seq ?? 0,
      last ? at(last.at) : null,
      at(thread.created)
    );
    for (const member of thread.members) {
      // Most members have read everything; the rest stopped somewhere earlier.
      const readUpTo =
        rng.chance(0.75) || !last
          ? (last?.seq ?? 0)
          : thread.messages[rng.int(0, thread.messages.length - 1)]!.seq - 1;
      const unread = thread.messages.filter(
        (m) => m.seq > readUpTo && m.sender !== member
      ).length;
      participants.add(thread.id, member, at(thread.created), readUpTo, unread);
      const list = conversationsByUser.get(member) ?? [];
      list.push(thread.id);
      conversationsByUser.set(member, list);
    }
  }
  for (const { thread, message } of allMessages) {
    messages.add(
      message.id,
      message.seq,
      thread.id,
      message.sender,
      paragraph(rng.pick, rng.int(1, 2)),
      rng.uuid(),
      at(message.at)
    );
  }

  // ---- Notifications -------------------------------------------------------------------------------------
  const notifications = table("notification", [
    ["id", "uuid"],
    ["recipient_id", "uuid"],
    ["type", "text"],
    ["category", '"NotificationCategory"'],
    ["payload", "jsonb"],
    ["dedupe_key", "text"],
    ["read_at", "timestamptz"],
    ["created_at", "timestamptz"],
  ]);
  for (let i = 0; i < scale(10); i += 1) {
    const type = rng.weighted([
      ["connection.requested", 20],
      ["connection.accepted", 20],
      ["comment.created", 25],
      ["event.registered", 10],
      ["job.published", 10],
      ["mentorship.requested", 5],
      ["announcement.published", 10],
    ] as const);
    const payload =
      type === "comment.created" || type === "announcement.published"
        ? { postId: recentPost().id }
        : type === "event.registered"
          ? {
              eventId: rng.pick(
                upcomingEventIds.length > 0 ? upcomingEventIds : [spikeEvent.id]
              ),
            }
          : type === "job.published" && publishedJobIds.length > 0
            ? { jobId: rng.pick(publishedJobIds) }
            : {};
    const ageDays = 90 * rng.next();
    const created = now - Math.floor(ageDays * DAY) - 1000;
    notifications.add(
      rng.uuid(),
      rng.pick(active).id,
      type,
      type === "event.registered" ? "TRANSACTIONAL" : "ENGAGEMENT",
      JSON.stringify(payload),
      `perf:${i}`,
      // Older notifications are more likely to have been read.
      rng.chance(0.4 + 0.5 * (ageDays / 90)) ? at(created + 3_600_000) : null,
      at(created)
    );
  }

  // ---- Sessions for load users ---------------------------------------------------------------------------
  const sessions = table("session", [
    ["id", "uuid"],
    ["token", "text"],
    ["expires_at", "timestamptz"],
    ["ip_address", "text"],
    ["user_agent", "text"],
    ["user_id", "uuid"],
    ["created_at", "timestamptz"],
    ["updated_at", "timestamptz"],
  ]);
  const loadUsers = rng.sample(active, options.sessions).map((member) => {
    const token = rng.token(32);
    // Created "now", so the once-a-day sliding refresh (session.updateAge) never fires during a run.
    sessions.add(
      rng.uuid(),
      token,
      at(now + 30 * DAY),
      "127.0.0.1",
      "k6-perf",
      member.id,
      at(now),
      at(now)
    );
    return { userId: member.id, email: member.email, token };
  });

  const visibleProfiles = active.filter(
    (m) => m.visibility === "PUBLIC" || m.visibility === "MEMBERS_ONLY"
  );
  const fixture: PerfFixture = {
    options: {
      users: options.users,
      seed: options.seed,
      now: options.now.toISOString(),
      sessions: options.sessions,
    },
    loadUsers,
    conversationsByUser: Object.fromEntries(
      loadUsers.map((u) => [u.userId, conversationsByUser.get(u.userId) ?? []])
    ),
    spikeEvent,
    upcomingEventIds: upcomingEventIds.slice(0, 50),
    publishedJobIds: publishedJobIds.slice(0, 50),
    profileUserIds: rng.sample(visibleProfiles, 200).map((m) => m.id),
    signInEmails: rng.sample(active, 500).map((m) => m.email),
    searchTerms: [
      ...rng.sample(LAST_NAMES, 8),
      ...rng.sample(FIRST_NAMES, 8),
      ...rng.sample(COMPANIES, 6),
      ...rng.sample(SKILLS, 6),
      // Substrings and one-letter typos: the trigram paths.
      "shar",
      "kum",
      "Sharam",
      "Gupat",
      "Infosis",
      "Kubernets",
    ],
    departmentCodes: reference.departments.map((d) => d.code),
  };

  return {
    tables: [
      users,
      accounts,
      profiles,
      userRoles,
      experience,
      education,
      skills,
      links,
      connections,
      mentorProfiles,
      mentorships,
      jobs,
      events,
      registrations,
      posts,
      achievements,
      comments,
      reactions,
      conversations,
      participants,
      messages,
      notifications,
      sessions,
    ].map(({ table: name, columns, rows }) => ({ table: name, columns, rows })),
    fixture,
  };
}
