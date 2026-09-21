import {
  EDUCATION_FIELDS,
  educationSchema,
  EXPERIENCE_FIELDS,
  experienceSchema,
  LINK_FIELDS,
  linkSchema,
  SKILL_FIELDS,
  skillSchema,
} from "../../domain/profile-items";
import { parseForm } from "./parse-form";

export const parseExperienceForm = (formData: FormData) =>
  parseForm(experienceSchema, EXPERIENCE_FIELDS, formData);

export const parseEducationForm = (formData: FormData) =>
  parseForm(educationSchema, EDUCATION_FIELDS, formData);

export const parseSkillForm = (formData: FormData) =>
  parseForm(skillSchema, SKILL_FIELDS, formData);

export const parseLinkForm = (formData: FormData) =>
  parseForm(linkSchema, LINK_FIELDS, formData);
