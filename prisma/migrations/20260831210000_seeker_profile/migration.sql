-- Этап 21: кабинет соискателя — резюме, уведомления, код привязки Telegram.

ALTER TABLE "User" ADD COLUMN "resumeText" TEXT;
ALTER TABLE "User" ADD COLUMN "resumeUrl" TEXT;
ALTER TABLE "User" ADD COLUMN "notifyTelegram" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "telegramLinkCode" TEXT;

CREATE UNIQUE INDEX "User_telegramLinkCode_key" ON "User"("telegramLinkCode");
