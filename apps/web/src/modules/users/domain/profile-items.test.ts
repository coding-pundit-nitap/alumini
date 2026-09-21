import { describe, expect, it } from "vitest";

import {
  educationClockProblems,
  educationSchema,
  experienceClockProblems,
  experienceSchema,
  linkSchema,
  normaliseLinkUrl,
  skillSchema,
} from "./profile-items";

const NOW = new Date("2026-09-21T10:00:00Z");

const fields = (result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[] }[] };
}) => (result.success ? [] : result.error!.issues.map((i) => i.path[0]));

describe("experienceSchema", () => {
  const past = {
    company: "Acme",
    industry: "Robotics",
    designation: "Engineer",
    startDate: "2020-01-15",
    endDate: "2021-06-30",
  };

  it("parses a past role", () => {
    expect(experienceSchema.parse(past)).toEqual({
      ...past,
      isCurrent: false,
    });
  });

  it("parses a current role: checkbox on, no end date", () => {
    expect(
      experienceSchema.parse({
        ...past,
        endDate: "",
        industry: "",
        isCurrent: "on",
      })
    ).toEqual({ ...past, endDate: null, industry: null, isCurrent: true });
  });

  it("requires an end date for a past role and forbids one for a current role", () => {
    expect(
      fields(experienceSchema.safeParse({ ...past, endDate: "" }))
    ).toEqual(["endDate"]);
    expect(
      fields(experienceSchema.safeParse({ ...past, isCurrent: "on" }))
    ).toEqual(["endDate"]);
  });

  it("rejects an end date before the start date", () => {
    expect(
      fields(experienceSchema.safeParse({ ...past, endDate: "2019-12-31" }))
    ).toEqual(["endDate"]);
  });

  it.each(["2020-13-01", "2020-02-30", "20-01-2020", "yesterday", ""])(
    "rejects the start date %j",
    (startDate) => {
      expect(
        fields(experienceSchema.safeParse({ ...past, startDate }))
      ).toContain("startDate");
    }
  );

  it("enforces text limits", () => {
    expect(
      fields(experienceSchema.safeParse({ ...past, company: "x".repeat(101) }))
    ).toEqual(["company"]);
    expect(
      fields(experienceSchema.safeParse({ ...past, designation: " " }))
    ).toEqual(["designation"]);
    expect(
      fields(experienceSchema.safeParse({ ...past, industry: "x".repeat(81) }))
    ).toEqual(["industry"]);
  });

  it("rejects unknown keys, such as a forged userId", () => {
    expect(
      experienceSchema.safeParse({ ...past, userId: "someone-else" }).success
    ).toBe(false);
  });
});

describe("experienceClockProblems", () => {
  const base = {
    company: "A",
    industry: null,
    designation: "B",
    startDate: "2020-01-01",
    endDate: "2021-01-01",
    isCurrent: false,
  };
  it("accepts dates up to today", () => {
    expect(experienceClockProblems(base, NOW)).toEqual([]);
    expect(
      experienceClockProblems(
        { ...base, startDate: "2026-09-21", endDate: null, isCurrent: true },
        NOW
      )
    ).toEqual([]);
  });
  it("refuses a start date in the future", () => {
    expect(
      experienceClockProblems(
        { ...base, startDate: "2026-09-22", endDate: null, isCurrent: true },
        NOW
      ).map((p) => p.field)
    ).toEqual(["startDate"]);
  });
  it("refuses an end date in the future", () => {
    expect(
      experienceClockProblems({ ...base, endDate: "2027-01-01" }, NOW).map(
        (p) => p.field
      )
    ).toEqual(["endDate"]);
  });
});

describe("educationSchema", () => {
  const valid = {
    institution: "IIT Madras",
    qualification: "M.Tech",
    fieldOfStudy: "Robotics",
    startYear: "2019",
    endYear: "2021",
  };

  it("parses a finished entry, coercing the years", () => {
    expect(educationSchema.parse(valid)).toEqual({
      ...valid,
      startYear: 2019,
      endYear: 2021,
    });
  });

  it("treats a blank end year as ongoing and a blank field as null", () => {
    expect(
      educationSchema.parse({ ...valid, endYear: "", fieldOfStudy: "" })
    ).toMatchObject({ endYear: null, fieldOfStudy: null });
  });

  it("rejects years out of range, non-integers, and end before start", () => {
    expect(
      fields(educationSchema.safeParse({ ...valid, startYear: "1949" }))
    ).toEqual(["startYear"]);
    expect(
      fields(educationSchema.safeParse({ ...valid, endYear: "2101" }))
    ).toEqual(["endYear"]);
    expect(
      fields(educationSchema.safeParse({ ...valid, startYear: "2019.5" }))
    ).toEqual(["startYear"]);
    expect(
      fields(educationSchema.safeParse({ ...valid, endYear: "2018" }))
    ).toEqual(["endYear"]);
  });

  it("enforces text limits and rejects unknown keys", () => {
    expect(
      fields(
        educationSchema.safeParse({ ...valid, institution: "x".repeat(151) })
      )
    ).toEqual(["institution"]);
    expect(
      educationSchema.safeParse({ ...valid, graduationYear: "1999" }).success
    ).toBe(false);
  });
});

describe("educationClockProblems", () => {
  const base = {
    institution: "A",
    qualification: "B",
    fieldOfStudy: null,
    startYear: 2019,
    endYear: 2021,
  };
  it("accepts years up to the current year and an ongoing entry", () => {
    expect(educationClockProblems(base, NOW)).toEqual([]);
    expect(
      educationClockProblems({ ...base, startYear: 2026, endYear: null }, NOW)
    ).toEqual([]);
  });
  it("refuses a start or end year in the future", () => {
    expect(
      educationClockProblems(
        { ...base, startYear: 2027, endYear: null },
        NOW
      ).map((p) => p.field)
    ).toEqual(["startYear"]);
    expect(
      educationClockProblems({ ...base, endYear: 2027 }, NOW).map(
        (p) => p.field
      )
    ).toEqual(["endYear"]);
  });
});

describe("skillSchema", () => {
  it("normalises to NFKC, collapses whitespace, strips zero-width characters, keeps casing", () => {
    expect(skillSchema.parse({ skill: "  Type​Script \t Ｎode " })).toEqual({
      skill: "TypeScript Node",
    });
  });
  it("rejects empty, over-long and unknown keys", () => {
    expect(fields(skillSchema.safeParse({ skill: "  " }))).toEqual(["skill"]);
    expect(fields(skillSchema.safeParse({ skill: "x".repeat(51) }))).toEqual([
      "skill",
    ]);
    expect(skillSchema.safeParse({ skill: "Go", userId: "x" }).success).toBe(
      false
    );
  });
});

describe("normaliseLinkUrl", () => {
  const ok = (url: string, type = "WEBSITE" as const) =>
    normaliseLinkUrl(url, type);

  it.each([
    ["https://Example.COM/Path?q=1#frag", "https://example.com/Path?q=1"],
    ["https://example.com/", "https://example.com"],
    ["https://example.com:443/a", "https://example.com/a"],
    ["  https://example.com/a  ", "https://example.com/a"],
  ])("normalises %j", (input, expected) => {
    expect(ok(input)).toEqual({ ok: true, url: expected });
  });

  it.each([
    ["http://example.com", "http"],
    ["javascript:alert(1)", "javascript"],
    ["data:text/html,<script>", "data"],
    ["ftp://example.com", "ftp"],
    ["https://user:pass@example.com", "credentials"],
    ["https://localhost/a", "localhost"],
    ["https://intranet/a", "no dot"],
    ["https://127.0.0.1/a", "ipv4"],
    ["https://[::1]/a", "ipv6"],
    ["not a url", "garbage"],
    ["", "empty"],
  ])("rejects %j (%s)", (input) => {
    expect(ok(input).ok).toBe(false);
  });

  it.each([
    ["LINKEDIN", "https://www.linkedin.com/in/asha", true],
    ["LINKEDIN", "https://linkedin.com/in/asha", true],
    ["LINKEDIN", "https://evil-linkedin.com/in/asha", false],
    ["LINKEDIN", "https://linkedin.com.evil.io/in/asha", false],
    ["GITHUB", "https://github.com/asha", true],
    ["GITHUB", "https://gist.github.com/asha", true],
    ["GITHUB", "https://example.com/asha", false],
    ["TWITTER", "https://twitter.com/asha", true],
    ["TWITTER", "https://x.com/asha", true],
    ["TWITTER", "https://notx.com/asha", false],
    ["OTHER", "https://anything.example.org/x", true],
  ] as const)("a %s link to %s is accepted: %s", (type, url, accepted) => {
    expect(normaliseLinkUrl(url, type).ok).toBe(accepted);
  });
});

describe("linkSchema", () => {
  it("parses a typed link and normalises the url", () => {
    expect(
      linkSchema.parse({ type: "GITHUB", url: "https://GitHub.com/asha#top" })
    ).toEqual({ type: "GITHUB", url: "https://github.com/asha" });
  });
  it("reports a url problem on the url field", () => {
    const r = linkSchema.safeParse({
      type: "GITHUB",
      url: "http://github.com/a",
    });
    expect(fields(r)).toEqual(["url"]);
  });
  it("rejects an unknown type and unknown keys", () => {
    expect(
      linkSchema.safeParse({ type: "FACEBOOK", url: "https://example.com" })
        .success
    ).toBe(false);
    expect(
      linkSchema.safeParse({
        type: "WEBSITE",
        url: "https://example.com",
        userId: "x",
      }).success
    ).toBe(false);
  });
});
