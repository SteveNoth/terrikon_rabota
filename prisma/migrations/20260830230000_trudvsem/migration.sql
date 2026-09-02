-- Этап 18A: открытые данные «Работы России».
-- Source.TRUDVSEM, зарплата до вычета, ИНН, дата снятия с публикации.

-- AlterEnum
ALTER TYPE "Source" ADD VALUE 'TRUDVSEM';

-- AlterTable Vacancy
ALTER TABLE "Vacancy" ADD COLUMN "salaryIsGross" BOOLEAN,
ADD COLUMN "employerInn" TEXT,
ADD COLUMN "archivedAt" TIMESTAMP(3);

-- AlterTable Employer
ALTER TABLE "Employer" ADD COLUMN "inn" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Employer_inn_key" ON "Employer"("inn");

-- CreateIndex
CREATE INDEX "Vacancy_employerInn_idx" ON "Vacancy"("employerInn");
