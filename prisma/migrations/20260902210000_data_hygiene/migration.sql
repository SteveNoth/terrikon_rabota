-- Этап 25: счётчики городов/сфер, снимок размера базы, индексы очистки.

CREATE TABLE "CityStat" (
    "citySlug" TEXT NOT NULL,
    "vacancyCount" INTEGER NOT NULL DEFAULT 0,
    "vahtaCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CityStat_pkey" PRIMARY KEY ("citySlug")
);

CREATE TABLE "SphereStat" (
    "citySlug" TEXT NOT NULL,
    "sphere" TEXT NOT NULL,
    "vacancyCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SphereStat_pkey" PRIMARY KEY ("citySlug","sphere")
);

CREATE TABLE "DbSizeSample" (
    "id" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bytes" INTEGER NOT NULL,
    "tableCounts" JSONB NOT NULL,
    "vacancyRows" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DbSizeSample_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DbSizeSample_capturedAt_idx" ON "DbSizeSample"("capturedAt");
CREATE INDEX "Vacancy_isActive_lastSeenAt_idx" ON "Vacancy"("isActive", "lastSeenAt");
CREATE INDEX "ParserRun_startedAt_idx" ON "ParserRun"("startedAt");
