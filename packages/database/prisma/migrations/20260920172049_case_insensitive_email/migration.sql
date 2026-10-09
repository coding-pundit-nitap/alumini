-- Case-insensitive uniqueness on email. Prisma's schema
-- language cannot express an expression index, so this is hand-written and Prisma treats it as
-- opaque on future `migrate dev` runs. The plain UNIQUE(email) from init_auth stays — it keeps
-- Better Auth's `findUnique({ where: { email } })` valid; this index is the real invariant.
CREATE UNIQUE INDEX uq_user_email_ci ON "user" (lower(email));
