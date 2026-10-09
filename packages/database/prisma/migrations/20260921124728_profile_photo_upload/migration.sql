-- CreateEnum
CREATE TYPE "UploadPurpose" AS ENUM ('PROFILE_PHOTO');

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('PENDING_UPLOAD', 'PENDING_SCAN', 'READY', 'REJECTED');

-- AlterTable
ALTER TABLE "profile" DROP COLUMN "photo_url",
ADD COLUMN     "photo_upload_id" UUID;

-- CreateTable
CREATE TABLE "upload" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_id" UUID NOT NULL,
    "purpose" "UploadPurpose" NOT NULL,
    "object_key" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "status" "UploadStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "reject_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "upload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "upload_owner_id_status_idx" ON "upload"("owner_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "profile_photo_upload_id_key" ON "profile"("photo_upload_id");

-- AddForeignKey
ALTER TABLE "profile" ADD CONSTRAINT "profile_photo_upload_id_fkey" FOREIGN KEY ("photo_upload_id") REFERENCES "upload"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload" ADD CONSTRAINT "upload_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Size and type bounds match the domain rules (spec 3C); this CHECK is the backstop.
ALTER TABLE "upload"
  ADD CONSTRAINT "ck_upload_size" CHECK ("size" BETWEEN 1 AND 5242880),
  ADD CONSTRAINT "ck_upload_mime" CHECK ("mime" IN ('image/jpeg', 'image/png', 'image/webp'));

-- The object key's prefix tracks the object's lifecycle: raw bytes live under uploads/pending/ until the
-- worker scans them, after which the row is rewritten to point at the derivative under avatars/. A
-- REJECTED row is not constrained further (its object may already be gone).
ALTER TABLE "upload"
  ADD CONSTRAINT "ck_upload_object_key_prefix" CHECK (
    (status IN ('PENDING_UPLOAD', 'PENDING_SCAN') AND object_key LIKE 'uploads/pending/%')
    OR (status = 'READY' AND object_key LIKE 'avatars/%')
    OR status = 'REJECTED'
  );
