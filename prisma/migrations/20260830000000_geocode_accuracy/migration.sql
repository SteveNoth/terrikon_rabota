-- CreateEnum
CREATE TYPE "GeocodeAccuracy" AS ENUM ('EXACT', 'DISTRICT', 'CITY');

-- AlterTable
ALTER TABLE "GeocodeCache" ADD COLUMN "accuracy" "GeocodeAccuracy" NOT NULL DEFAULT 'CITY';

-- AlterTable
ALTER TABLE "Vacancy" ADD COLUMN "geocodeAccuracy" "GeocodeAccuracy";
