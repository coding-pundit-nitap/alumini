-- AlterTable
ALTER TABLE "profile" ADD COLUMN     "contact_visibility" "ProfileVisibility",
ADD COLUMN     "education_visibility" "ProfileVisibility",
ADD COLUMN     "experience_visibility" "ProfileVisibility",
ADD COLUMN     "location_visibility" "ProfileVisibility";

-- Overrides are never looser than the profile level (enum declaration order: PUBLIC < ... < PRIVATE).
ALTER TABLE "profile"
  ADD CONSTRAINT "ck_profile_contact_visibility" CHECK ("contact_visibility" IS NULL OR "contact_visibility" >= "visibility"),
  ADD CONSTRAINT "ck_profile_location_visibility" CHECK ("location_visibility" IS NULL OR "location_visibility" >= "visibility"),
  ADD CONSTRAINT "ck_profile_experience_visibility" CHECK ("experience_visibility" IS NULL OR "experience_visibility" >= "visibility"),
  ADD CONSTRAINT "ck_profile_education_visibility" CHECK ("education_visibility" IS NULL OR "education_visibility" >= "visibility");

-- Length limits behind the Zod schemas (char_length counts characters, not bytes).
ALTER TABLE "profile"
  ADD CONSTRAINT "ck_profile_full_name_length" CHECK (char_length("full_name") BETWEEN 1 AND 100),
  ADD CONSTRAINT "ck_profile_headline_length" CHECK ("headline" IS NULL OR char_length("headline") <= 120),
  ADD CONSTRAINT "ck_profile_bio_length" CHECK ("bio" IS NULL OR char_length("bio") <= 2000),
  ADD CONSTRAINT "ck_profile_location_length" CHECK ("location" IS NULL OR char_length("location") <= 100);
