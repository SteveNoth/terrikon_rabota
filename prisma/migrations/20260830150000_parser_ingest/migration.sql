-- AlterTable
ALTER TABLE "Vacancy" ADD COLUMN "ocrText" TEXT,
ADD COLUMN "imageUrls" JSONB,
ADD COLUMN "splitIndex" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "sourcePostExternalId" TEXT NOT NULL DEFAULT '',
ADD COLUMN "ocrVersion" TEXT,
ADD COLUMN "splitterVersion" TEXT;

-- Backfill: у сидов и старых записей пост = externalId без суффикса #2.
UPDATE "Vacancy"
SET "sourcePostExternalId" = split_part("externalId", '#', 1)
WHERE "sourcePostExternalId" = '';

ALTER TABLE "Vacancy" ALTER COLUMN "sourcePostExternalId" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "Vacancy_sourcePostExternalId_idx" ON "Vacancy"("sourcePostExternalId");

-- CreateIndex
CREATE INDEX "Vacancy_source_sourcePostExternalId_idx" ON "Vacancy"("source", "sourcePostExternalId");

-- CreateIndex
CREATE INDEX "Vacancy_contactPhone_idx" ON "Vacancy"("contactPhone");
