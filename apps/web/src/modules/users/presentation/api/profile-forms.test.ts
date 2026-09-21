import { describe, expect, it } from "vitest";

import { ValidationError } from "@/lib/errors";

import { parsePrivacyForm, parseProfileForm } from "./profile-forms";

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
};

describe("parseProfileForm", () => {
  it("reads only the four named fields and sanitises them", () => {
    expect(
      parseProfileForm(
        form({
          fullName: " Asha  Rao ",
          headline: "",
          bio: "Hi",
          location: "Goa",
        })
      )
    ).toEqual({
      fullName: "Asha Rao",
      headline: null,
      bio: "Hi",
      location: "Goa",
    });
  });

  it("ignores forged fields such as userId and graduationYear (never reaches the use case)", () => {
    const parsed = parseProfileForm(
      form({
        fullName: "Asha",
        userId: "someone-else",
        graduationYear: "1999",
        departmentId: "x",
      })
    );
    expect(parsed).toEqual({
      fullName: "Asha",
      headline: null,
      bio: null,
      location: null,
    });
  });

  it("throws a ValidationError naming each bad field", () => {
    const error = (() => {
      try {
        parseProfileForm(form({ fullName: "   ", headline: "x".repeat(121) }));
      } catch (e) {
        return e as ValidationError;
      }
    })();
    expect(error).toBeInstanceOf(ValidationError);
    expect(
      (error!.details as { field: string }[]).map((d) => d.field).sort()
    ).toEqual(["fullName", "headline"]);
  });
});

describe("parsePrivacyForm", () => {
  it("parses a level and a section override", () => {
    expect(
      parsePrivacyForm(form({ visibility: "PUBLIC", location: "PRIVATE" }))
    ).toEqual({
      visibility: "PUBLIC",
      contact: null,
      location: "PRIVATE",
      experience: null,
      education: null,
    });
  });

  it("rejects a looser override with a field error on that section", () => {
    let error: ValidationError | undefined;
    try {
      parsePrivacyForm(form({ visibility: "PRIVATE", location: "PUBLIC" }));
    } catch (e) {
      error = e as ValidationError;
    }
    expect(error).toBeInstanceOf(ValidationError);
    expect((error!.details as { field: string }[])[0]?.field).toBe("location");
  });
});
