import { NextResponse, type NextRequest } from "next/server";
import { authorizeTelegramWebhook } from "@/lib/telegram/auth";
import { handleTelegramUpdate } from "@/lib/telegram/handler";
import type { TelegramUpdate } from "@/lib/telegram/parse";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

function ok() {
  return new NextResponse("OK", {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET() {
  const token = Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim());
  const secret = Boolean(process.env.TELEGRAM_WEBHOOK_SECRET?.trim()) || token;
  return NextResponse.json(
    {
      ok: true,
      hint: "Этот адрес принимает POST от Telegram. В браузере открывать не нужно.",
      token,
      secret,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  if (!authorizeTelegramWebhook(request)) {
    return new NextResponse("Unauthorized", {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return ok();
  }

  try {
    await handleTelegramUpdate(update);
  } catch (cause) {
    console.error("[telegram/webhook]", cause);
  }

  return ok();
}
