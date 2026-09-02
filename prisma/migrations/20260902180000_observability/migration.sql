-- Этап 24: замеры LCP/CLS/INP по режиму качества и журнал служебных тревог.

CREATE TABLE "RumSample" (
    "id" TEXT NOT NULL,
    "qualityMode" TEXT NOT NULL,
    "lcpMs" INTEGER,
    "cls" DOUBLE PRECISION,
    "inpMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RumSample_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RumSample_createdAt_idx" ON "RumSample"("createdAt");
CREATE INDEX "RumSample_qualityMode_createdAt_idx" ON "RumSample"("qualityMode", "createdAt");

CREATE TABLE "OpsAlert" (
    "id" TEXT NOT NULL,
    "alertKey" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpsAlert_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OpsAlert_alertKey_key" ON "OpsAlert"("alertKey");
