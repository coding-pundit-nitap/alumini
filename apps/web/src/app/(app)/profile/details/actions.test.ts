import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: new Headers({ "x-request-id": "req-1" }),
  refresh: vi.fn(),
  getActor: vi.fn(),
  parseExperience: vi.fn(),
  parseEducation: vi.fn(),
  parseSkill: vi.fn(),
  parseLink: vi.fn(),
  parseId: vi.fn(),
  experience: { add: vi.fn(), update: vi.fn(), remove: vi.fn() },
  education: { add: vi.fn(), update: vi.fn(), remove: vi.fn() },
  skill: { add: vi.fn(), update: vi.fn(), remove: vi.fn() },
  link: { add: vi.fn(), update: vi.fn(), remove: vi.fn() },
}));
vi.mock("next/headers", () => ({ headers: async () => mocks.headers }));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));
vi.mock("@/modules/auth", () => ({ getActor: mocks.getActor }));
vi.mock("@/modules/users", () => ({
  parseExperienceForm: mocks.parseExperience,
  parseEducationForm: mocks.parseEducation,
  parseSkillForm: mocks.parseSkill,
  parseLinkForm: mocks.parseLink,
  parseItemId: mocks.parseId,
}));
vi.mock("@/composition/users", () => ({
  experienceUseCases: mocks.experience,
  educationUseCases: mocks.education,
  skillUseCases: mocks.skill,
  linkUseCases: mocks.link,
}));

import { AuthorizationError, ValidationError } from "@/lib/errors";

import {
  addEducationAction,
  addExperienceAction,
  addLinkAction,
  addSkillAction,
  removeEducationAction,
  removeExperienceAction,
  removeLinkAction,
  removeSkillAction,
  updateEducationAction,
  updateExperienceAction,
  updateLinkAction,
  updateSkillAction,
} from "./actions";

const actor = { userId: "u1", accountState: "PENDING" };
const itemId = "11111111-1111-4111-8111-111111111111";

const experienceInput = {
  company: "Acme",
  industry: null,
  designation: "Engineer",
  startDate: "2020-01-01",
  endDate: null,
  isCurrent: true,
};
const educationInput = {
  institution: "IIT Madras",
  qualification: "M.Tech",
  fieldOfStudy: null,
  startYear: 2019,
  endYear: 2021,
};
const skillInput = { skill: "TypeScript" };
const linkInput = { type: "GITHUB", url: "https://github.com/asha" };

beforeEach(() => {
  mocks.refresh.mockReset();
  mocks.getActor.mockReset().mockResolvedValue(actor);
  mocks.parseExperience.mockReset().mockReturnValue(experienceInput);
  mocks.parseEducation.mockReset().mockReturnValue(educationInput);
  mocks.parseSkill.mockReset().mockReturnValue(skillInput);
  mocks.parseLink.mockReset().mockReturnValue(linkInput);
  mocks.parseId.mockReset().mockReturnValue(itemId);
  for (const uc of [
    mocks.experience,
    mocks.education,
    mocks.skill,
    mocks.link,
  ]) {
    uc.add.mockReset().mockResolvedValue({ id: itemId });
    uc.update.mockReset().mockResolvedValue({ id: itemId });
    uc.remove.mockReset().mockResolvedValue(undefined);
  }
});

describe.each([
  {
    name: "experience",
    input: experienceInput,
    parse: mocks.parseExperience,
    useCase: mocks.experience,
    add: addExperienceAction,
    update: updateExperienceAction,
    remove: removeExperienceAction,
  },
  {
    name: "education",
    input: educationInput,
    parse: mocks.parseEducation,
    useCase: mocks.education,
    add: addEducationAction,
    update: updateEducationAction,
    remove: removeEducationAction,
  },
  {
    name: "skill",
    input: skillInput,
    parse: mocks.parseSkill,
    useCase: mocks.skill,
    add: addSkillAction,
    update: updateSkillAction,
    remove: removeSkillAction,
  },
  {
    name: "link",
    input: linkInput,
    parse: mocks.parseLink,
    useCase: mocks.link,
    add: addLinkAction,
    update: updateLinkAction,
    remove: removeLinkAction,
  },
])("$name actions", ({ input, parse, useCase, add, update, remove }) => {
  it("add: parses the form and calls the use case with the session's actor", async () => {
    const form = new FormData();
    form.set("userId", "someone-else"); // a forged field: irrelevant, the parser ignores it

    const result = await add(form);

    expect(result).toEqual({ ok: true, data: { id: itemId } });
    expect(parse).toHaveBeenCalledWith(form);
    expect(useCase.add).toHaveBeenCalledWith({ actor, input });
    // The list on /profile/details must reflect the new item without a full navigation.
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("add: returns per-field errors, never calls the use case, and never refreshes", async () => {
    parse.mockImplementation(() => {
      throw new ValidationError({
        details: [{ field: "x", code: "INVALID", message: "Bad." }],
      });
    });
    const result = await add(new FormData());
    expect(result).toMatchObject({
      ok: false,
      error: { fields: { x: "Bad." } },
    });
    expect(useCase.add).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("add: surfaces a denial from the use case and never refreshes", async () => {
    useCase.add.mockRejectedValue(new AuthorizationError());
    expect(await add(new FormData())).toMatchObject({
      ok: false,
      error: { code: "PERMISSION_DENIED" },
    });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("update: parses the id and the fields, calls the use case with both, and refreshes", async () => {
    const form = new FormData();
    const result = await update(form);

    expect(result).toEqual({ ok: true, data: { id: itemId } });
    expect(useCase.update).toHaveBeenCalledWith({
      actor,
      itemId,
      input,
    });
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("remove: parses only the id, calls the use case, and refreshes", async () => {
    const form = new FormData();
    const result = await remove(form);

    expect(result).toEqual({ ok: true, data: undefined });
    expect(useCase.remove).toHaveBeenCalledWith({ actor, itemId });
    expect(parse).not.toHaveBeenCalled();
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
});
