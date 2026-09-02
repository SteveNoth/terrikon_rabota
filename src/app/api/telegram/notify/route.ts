import { NextResponse, type NextRequest } from "next/server";
import { authorizeParserRequest, unauthorizedResponse } from "@/lib/parser/auth";
import { telegramBotToken } from "@/lib/telegram/auth";
import { dispatchTelegramNotifications } from "@/lib/telegram/notify";
import { TELEGRAM_NOTIFY_BATCH } from "@/lib/telegram/constants";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  if (!authorizeParserRequest(request)) {
    return unauthorizedResponse();
  }

  if (!telegramBotToken()) {
    return json({ ok: false, done: true, reason: "TELEGRAM_BOT_TOKEN не задан" });
  }

  let limit = TELEGRAM_NOTIFY_BATCH;
  try {
    const text = await request.text();
    if (text.trim()) {
      const payload = JSON.parse(text) as { limit?: unknown };
      if (typeof payload?.limit === "number" && Number.isFinite(payload.limit)) {
        limit = Math.min(80, Math.max(1, Math.floor(payload.limit)));
      }
    }
  } catch {
    limit = TELEGRAM_NOTIFY_BATCH;
  }

  try {
    const stats = await dispatchTelegramNotifications({ limit, deadlineMs: 8000 });
    return json(stats);
  } catch (cause) {
    console.error("[api/telegram/notify]", cause);
    return json({ ok: false, error: "Не удалось разослать уведомления." }, 500);
  }
}
