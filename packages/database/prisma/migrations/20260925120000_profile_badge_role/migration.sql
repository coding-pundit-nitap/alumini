-- which role's tick the member shows on their photo. NULL = automatic (highest held role),
-- a role name = that role while it is still held, 'NONE' = no tick. Validated by the use case against the
-- member's current roles; role names are rows, not an enum, so there is no CHECK against them here.
ALTER TABLE "profile" ADD COLUMN "badge_role" TEXT;
ALTER TABLE "profile" ADD CONSTRAINT "ck_profile_badge_role_length" CHECK (char_length("badge_role") BETWEEN 1 AND 50);
