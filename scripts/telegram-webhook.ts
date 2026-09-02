/**
 * Установка и проверка webhook Telegram.
 *
 *   npx tsx scripts/telegram-webhook.ts info
 *   npx tsx scripts/telegram-webhook.ts set
 *   npx tsx scripts/telegram-webhook.ts delete
 *
 * Токен не печатаем. URL webhook — SITE_URL или NEXT_PUBLIC_SITE_URL.
 */
import { config as loadEnv } from "dotenv";
import { createHash } from "node:crypto";

loadEnv({ path: ".env", quiet: true });
loadEnv({ path: ".env.local", override: true, quiet: true });

const API = "https://api.telegram.org";

function token(): string {
  const value = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (value.length < 20) {
    throw new Error("TELEGRAM_BOT_TOKEN пуст. Сначала создайте бота у @BotFather и запишите токен в .env.local.");
  }
  return value;
}

function secret(): string {
  const explicit = (process.env.TELEGRAM_WEBHOOK_SECRET || "").trim();
  if (explicit.length >= 8 && /^[A-Za-z0-9_-]+$/.test(explicit)) {
    return explicit;
  }
  return createHash("sha256").update(`tr-webhook:${token()}`).digest("hex");
}

function siteUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://terrikon-rabota.vercel.app").trim();
  return raw.replace(/\/$/, "");
}

function hookUrl(): string {
  return `${siteUrl()}/api/telegram/webhook`;
}

async function call(method: string, body?: Record<string, unknown>): Promise<unknown> {
  const url = `${API}/bot${token()}/${method}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : "{}",
  });
  return response.json();
}

function printInfo(payload: unknown): void {
  const data = payload as {
    ok?: boolean;
    description?: string;
    result?: {
      url?: string;
      last_error_date?: number;
      last_error_message?: string;
      pending_update_count?: number;
      has_custom_certificate?: boolean;
    };
  };
  if (!data.ok) {
    console.log("getWebhookInfo не удался:", data.description ?? payload);
    console.log("Если 401 — токен неверный. Если 404 — бота удалили у @BotFather.");
    return;
  }
  const result = data.result ?? {};
  console.log("url:", result.url || "(не установлен)");
  console.log("ожидаемый url:", hookUrl());
  console.log("pending_update_count:", result.pending_update_count ?? 0);
  if (result.last_error_message) {
    const when = result.last_error_date
      ? new Date(result.last_error_date * 1000).toISOString()
      : "?";
    console.log("last_error:", when, result.last_error_message);
    console.log("Что делать:");
    console.log("  • 401/Unauthorized на webhook — секрет заголовка не совпал. Снова: npx tsx scripts/telegram-webhook.ts set");
    console.log("  • 404 — на Vercel нет /api/telegram/webhook, нужен деплой.");
    console.log("  • SSL / certificate — только HTTPS продакшена, не localhost.");
    console.log("  • Connection timed out — сайт не отвечает, смотрите Vercel.");
  } else {
    console.log("Ошибок от Telegram нет.");
  }
}

async function probeHook(): Promise<void> {
  const url = hookUrl();
  try {
    const response = await fetch(url, { method: "GET", cache: "no-store" });
    console.log("проверка GET webhook:", response.status, url);
    if (response.status === 404) {
      console.log("Кода бота на этом адресе нет. GitHub к Vercel не привязан — нужен деплой: npx vercel login, затем npx vercel --prod --yes");
    }
    if (response.ok) {
      const body = (await response.json()) as { token?: boolean; secret?: boolean };
      if (body.token === false) {
        console.log("На сайте нет TELEGRAM_BOT_TOKEN. Добавьте в Vercel → Environment Variables и заново задеплойте.");
      }
      if (body.secret === false) {
        console.log("На сайте нет секрета webhook. Задайте TELEGRAM_WEBHOOK_SECRET или токен, затем снова set.");
      }
    }
  } catch (cause) {
    console.log("не удалось открыть webhook:", cause instanceof Error ? cause.message : cause);
  }
}

async function main(): Promise<void> {
  const action = (process.argv[2] || "info").toLowerCase();
  if (action === "set") {
    const url = hookUrl();
    const payload = await call("setWebhook", {
      url,
      secret_token: secret(),
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: true,
    });
    console.log("setWebhook →", url);
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  if (action === "delete") {
    const payload = await call("deleteWebhook", { drop_pending_updates: true });
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  if (action === "info") {
    printInfo(await call("getWebhookInfo"));
    await probeHook();
    return;
  }
  console.log("Команды: info | set | delete");
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
