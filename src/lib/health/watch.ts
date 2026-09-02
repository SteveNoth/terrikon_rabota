import { prisma } from "@/lib/adapters/db";
import { notify } from "@/lib/adapters/notify";
import { log } from "@/lib/log";
import { evaluateParserAlerts, WATCHED_PARSERS, type ParserRunSnapshot } from "@/lib/health/parsers";

const RESEND_AFTER_MS = 6 * 60 * 60 * 1000;

export function adminChatId(): string | null {
  const value = process.env.TELEGRAM_ADMIN_CHAT_ID?.trim() ?? "";
  return value.length >= 3 ? value : null;
}

export type WatchResult = {
  alerts: { parser: string; kind: string; message: string }[];
  sent: number;
  skipped: number;
  reason: string | null;
};

export async function runParserWatch(now = new Date()): Promise<WatchResult> {
  const runs = await prisma.parserRun.findMany({
    where: { parser: { in: [...WATCHED_PARSERS] } },
    orderBy: { startedAt: "desc" },
    take: 40,
    select: {
      parser: true,
      startedAt: true,
      finishedAt: true,
      postsAccepted: true,
      vacanciesCreated: true,
    },
  });

  const byParser = new Map<string, ParserRunSnapshot[]>();
  for (const row of runs) {
    const list = byParser.get(row.parser) ?? [];
    list.push(row);
    byParser.set(row.parser, list);
  }

  const alerts = evaluateParserAlerts(byParser, now);
  const currentKeys = new Set(alerts.map((item) => item.alertKey));

  await prisma.opsAlert.deleteMany({
    where: currentKeys.size === 0 ? {} : { alertKey: { notIn: [...currentKeys] } },
  });

  if (alerts.length === 0) {
    return { alerts: [], sent: 0, skipped: 0, reason: null };
  }

  const chatId = adminChatId();
  if (!chatId) {
    log.warn("watch", "TELEGRAM_ADMIN_CHAT_ID пуст — тревогу некуда слать");
    return {
      alerts: alerts.map((item) => ({ parser: item.parser, kind: item.kind, message: item.message })),
      sent: 0,
      skipped: alerts.length,
      reason: "TELEGRAM_ADMIN_CHAT_ID не задан",
    };
  }

  const previous = await prisma.opsAlert.findMany({
    where: { alertKey: { in: [...currentKeys] } },
  });
  const lastSent = new Map(previous.map((row) => [row.alertKey, row.sentAt]));

  const fresh = alerts.filter((item) => {
    const sentAt = lastSent.get(item.alertKey);
    if (!sentAt) {
      return true;
    }
    return now.getTime() - sentAt.getTime() >= RESEND_AFTER_MS;
  });

  if (fresh.length === 0) {
    return {
      alerts: alerts.map((item) => ({ parser: item.parser, kind: item.kind, message: item.message })),
      sent: 0,
      skipped: alerts.length,
      reason: "уже сообщали, повтор не раньше чем через 6 часов",
    };
  }

  const text = ["Террикон Работа: парсеры", ...fresh.map((item) => `• ${item.message}`)].join("\n");
  const result = await notify.send({ chatId, text });
  if (!result.ok) {
    log.error("watch", "не удалось отправить тревогу в Telegram");
    return {
      alerts: fresh.map((item) => ({ parser: item.parser, kind: item.kind, message: item.message })),
      sent: 0,
      skipped: 0,
      reason: "Telegram не принял сообщение",
    };
  }

  await Promise.all(
    fresh.map((item) =>
      prisma.opsAlert.upsert({
        where: { alertKey: item.alertKey },
        create: { alertKey: item.alertKey, sentAt: now },
        update: { sentAt: now },
      }),
    ),
  );

  log.info("watch", "тревога ушла в Telegram", { count: fresh.length });
  return {
    alerts: fresh.map((item) => ({ parser: item.parser, kind: item.kind, message: item.message })),
    sent: fresh.length,
    skipped: alerts.length - fresh.length,
    reason: null,
  };
}
