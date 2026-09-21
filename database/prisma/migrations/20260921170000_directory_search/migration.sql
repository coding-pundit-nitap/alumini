-- Directory search, Stage A (TDS §14): PostgreSQL only, behind SearchPort. Prisma cannot express these
-- indexes, so they live here (as uq_user_email_ci does).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Fuzzy and substring matching (ILIKE and the <% typo operator) on the text a member can search by.
CREATE INDEX "idx_profile_full_name_trgm" ON "profile" USING GIN ("full_name" gin_trgm_ops);
CREATE INDEX "idx_profile_headline_trgm" ON "profile" USING GIN ("headline" gin_trgm_ops);
CREATE INDEX "idx_profile_location_trgm" ON "profile" USING GIN ("location" gin_trgm_ops);
CREATE INDEX "idx_profile_experience_company_trgm" ON "profile_experience" USING GIN ("company" gin_trgm_ops);
CREATE INDEX "idx_profile_skill_skill_trgm" ON "profile_skill" USING GIN ("skill" gin_trgm_ops);

-- Keyset order (key, user_id) for each sort. A missing graduation year sorts last in both directions,
-- which is why the key is COALESCEd: a NULL cannot take part in a row comparison.
CREATE INDEX "idx_profile_name_order" ON "profile" (lower("full_name"), "user_id");
CREATE INDEX "idx_profile_grad_year_asc" ON "profile" ((COALESCE("graduation_year", 9999)), "user_id");
CREATE INDEX "idx_profile_grad_year_desc" ON "profile" ((COALESCE("graduation_year", -1)) DESC, "user_id");
