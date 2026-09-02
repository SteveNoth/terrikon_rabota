import { telegramBotToken } from "@/lib/telegram/auth";
import type { ReplyMarkup } from "@/lib/telegram/keyboards";

const API_ROOT = "https://api.telegram.org";

export type TelegramApiResult = {
  ok: boolean;
  retryAfterSec?: number;
  blocked?: boolean;
  description?: string;
};

type SendPayload = {
  chat_id: string;
  text: string;
  disable_web_page_preview: true;
  reply_markup?: ReplyMarkup;
};

async function callApi(method: string, body: unknown, timeoutMs = 8000): Promise<TelegramApiResult> {
  const token = telegramBotToken();
  if (!token) {
    return { ok: false, description: "no token" };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_ROOT}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    let payload: { ok?: boolean; description?: string; parameters?: { retry_after?: number }; error_code?: number } =
      {};
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      payload = {};
    }
    if (response.status === 429 || payload.error_code === 429) {
      const retryAfterSec = Number(payload.parameters?.retry_after ?? 1);
      return { ok: false, retryAfterSec: Number.isFinite(retryAfterSec) ? retryAfterSec : 1 };
    }
    if (response.status === 403 || payload.error_code === 403) {
      return { ok: false, blocked: true, description: payload.description };
    }
    return { ok: payload.ok === true, description: payload.description };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "fetch failed";
    return { ok: false, description: message };
  } finally {
    clearTimeout(timer);
  }
}

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  replyMarkup?: ReplyMarkup,
): Promise<TelegramApiResult> {
  const payload: SendPayload = {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  };
  if (replyMarkup) {
    payload.reply_markup = replyMarkup;
  }
  return callApi("sendMessage", payload);
}

export async function answerCallbackQuery(callbackId: string, text?: string): Promise<TelegramApiResult> {
  return callApi("answerCallbackQuery", {
    callback_query_id: callbackId,
    ...(text ? { text } : {}),
  });
}

export function webhookSetUrl(siteUrl: string, secret: string, token: string): string {
  const base = siteUrl.replace(/\/$/, "");
  const hook = `${base}/api/telegram/webhook`;
  const params = new URLSearchParams({
    url: hook,
    secret_token: secret,
    allowed_updates: JSON.stringify(["message", "callback_query"]),
    drop_pending_updates: "true",
  });
  return `${API_ROOT}/bot${token}/setWebhook?${params.toString()}`;
}

export function webhookInfoUrl(token: string): string {
  return `${API_ROOT}/bot${token}/getWebhookInfo`;
}
