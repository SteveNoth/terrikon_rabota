-- Этап 22: привязка Telegram к аккаунту, шаг диалога, журнал доставки (один раз на группу дублей).

ALTER TABLE "TelegramUser" ADD COLUMN "dialog" TEXT NOT NULL DEFAULT 'idle';
ALTER TABLE "TelegramUser" ADD COLUMN "pendingKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "TelegramUser" ADD COLUMN "userId" TEXT;

CREATE UNIQUE INDEX "TelegramUser_userId_key" ON "TelegramUser"("userId");
CREATE INDEX "TelegramUser_citySlug_isActive_idx" ON "TelegramUser"("citySlug", "isActive");
CREATE INDEX "TelegramUser_isActive_lastNotifiedAt_idx" ON "TelegramUser"("isActive", "lastNotifiedAt");

ALTER TABLE "TelegramUser" ADD CONSTRAINT "TelegramUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "TelegramDelivery" (
    "id" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "vacancyId" TEXT NOT NULL,
    "groupKey" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramDelivery_telegramUserId_groupKey_key" ON "TelegramDelivery"("telegramUserId", "groupKey");
CREATE INDEX "TelegramDelivery_telegramUserId_sentAt_idx" ON "TelegramDelivery"("telegramUserId", "sentAt");
CREATE INDEX "TelegramDelivery_vacancyId_idx" ON "TelegramDelivery"("vacancyId");

ALTER TABLE "TelegramDelivery" ADD CONSTRAINT "TelegramDelivery_telegramUserId_fkey" FOREIGN KEY ("telegramUserId") REFERENCES "TelegramUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramDelivery" ADD CONSTRAINT "TelegramDelivery_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
