import {
  PRIVACY_FIELDS,
  PROFILE_FIELDS,
  updatePrivacySchema,
  updateProfileSchema,
} from "../../domain/profile-input";
import { parseForm } from "./parse-form";

export const parseProfileForm = (formData: FormData) =>
  parseForm(updateProfileSchema, PROFILE_FIELDS, formData);

export const parsePrivacyForm = (formData: FormData) =>
  parseForm(updatePrivacySchema, PRIVACY_FIELDS, formData);
