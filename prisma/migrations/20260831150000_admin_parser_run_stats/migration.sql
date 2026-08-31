-- Этап 19: в ParserRun — спорные, заблокированные и снимок причин отказа.
-- Админка рисует график по дням и топ причин, не ходя в логи парсера.

ALTER TABLE "ParserRun" ADD COLUMN "postsPending" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ParserRun" ADD COLUMN "postsBlocked" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ParserRun" ADD COLUMN "rejectReasons" JSONB;
