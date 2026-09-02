-- Этап 20: связь учётки сайта с Supabase Auth и карточкой работодателя.

ALTER TABLE "User" ADD COLUMN "authId" TEXT NOT NULL;

CREATE UNIQUE INDEX "User_authId_key" ON "User"("authId");

ALTER TABLE "Employer" ADD COLUMN "userId" TEXT;

CREATE UNIQUE INDEX "Employer_userId_key" ON "Employer"("userId");

ALTER TABLE "Employer" ADD CONSTRAINT "Employer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
