-- Этап 20A часть 2: журнал блока аккаунта и флаги для гардов.

CREATE TYPE "AccountBlockScope" AS ENUM ('PUBLISH', 'APPLY', 'LOGIN');

ALTER TABLE "User" ADD COLUMN "publishBlocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "applyBlocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "loginBlocked" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "AccountBlock" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" "AccountBlockScope" NOT NULL,
    "reason" TEXT NOT NULL,
    "publicNote" TEXT NOT NULL,
    "decidedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "liftedAt" TIMESTAMP(3),
    "liftedBy" TEXT,

    CONSTRAINT "AccountBlock_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccountBlock_userId_scope_liftedAt_idx" ON "AccountBlock"("userId", "scope", "liftedAt");

ALTER TABLE "AccountBlock" ADD CONSTRAINT "AccountBlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
