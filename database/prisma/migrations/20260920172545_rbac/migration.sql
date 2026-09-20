-- CreateEnum
CREATE TYPE "PermissionScope" AS ENUM ('GLOBAL', 'CHAPTER');

-- CreateTable
CREATE TABLE "role" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_role" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "granted_by" UUID NOT NULL,
    "granted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permission" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "role_id" UUID NOT NULL,
    "permission" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission_grant" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "permission" TEXT NOT NULL,
    "scope_type" "PermissionScope" NOT NULL,
    "chapter_id" UUID,
    "granted_by" UUID NOT NULL,
    "granted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3),

    CONSTRAINT "permission_grant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "role_name_key" ON "role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "uq_user_role" ON "user_role"("user_id", "role_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_role_permission" ON "role_permission"("role_id", "permission");

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission_grant" ADD CONSTRAINT "permission_grant_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission_grant" ADD CONSTRAINT "permission_grant_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission_grant" ADD CONSTRAINT "permission_grant_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Requires PostgreSQL 15+ (compose uses 17). Two GLOBAL grants of the same permission to the same
-- user are the same grant even though chapter_id is NULL both times.
ALTER TABLE "permission_grant" ADD CONSTRAINT uq_permission_grant
  UNIQUE NULLS NOT DISTINCT (user_id, permission, scope_type, chapter_id);

ALTER TABLE "permission_grant" ADD CONSTRAINT ck_grant_scope CHECK (
  (scope_type = 'GLOBAL'  AND chapter_id IS NULL) OR
  (scope_type = 'CHAPTER' AND chapter_id IS NOT NULL)
);
