ALTER TABLE "session" ADD CONSTRAINT ck_tmp_expiry CHECK (expires_at > created_at);
CREATE UNIQUE INDEX uq_tmp_lower_email ON "user" (lower(email));
CREATE INDEX ix_tmp_partial ON "session" (user_id) WHERE expires_at IS NOT NULL;
