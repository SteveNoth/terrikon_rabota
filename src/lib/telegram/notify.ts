import {
  TELEGRAM_MAX_PER_HOUR,
  TELEGRAM_NOTIFY_BATCH,
  TELEGRAM_NOTIFY_LOOKBACK_HOURS,
  TELEGRAM_SEND_PAUSE_MS,
} from "@/lib/telegram/constants";
import { sendTelegramMessage } from "@/lib/telegram/api";
import { formatVacancyMessage, vacancyPublicUrl } from "@/lib/telegram/format";
import { vacancyOpenKeyboard } from "@/lib/telegram/keyboards";
import { planDeliveries } from "@/lib/telegram/plan";
import {
  countDeliveriesSince,
  listActiveSubscribers,
  listDeliveredGroupKeys,
  listNotifyVacancies,
  markSubscriberBlocked,
  notifyGroupKey,
  recordDelivery,
} from "@/lib/repo/telegram";

export type NotifyStats = {
  ok: true;
  done: boolean;
  sent: number;
  skippedDup: number;
  skippedRate: number;
  skippedMismatch: number;
  remaining: number;
  subscribers: number;
  vacancies: number;
  elapsedMs: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function lookbackSince(now: Date): Date {
  return new Date(now.getTime() - TELEGRAM_NOTIFY_LOOKBACK_HOURS * 60 * 60 * 1000);
}

function hourAgo(now: Date): Date {
  return new Date(now.getTime() - 60 * 60 * 1000);
}

export async function dispatchTelegramNotifications(options?: {
  limit?: number;
  now?: Date;
  deadlineMs?: number;
}): Promise<NotifyStats> {
  const started = Date.now();
  const now = options?.now ?? new Date();
  const limit = Math.min(Math.max(options?.limit ?? TELEGRAM_NOTIFY_BATCH, 1), 80);
  const deadlineMs = options?.deadlineMs ?? 8000;

  const subscribers = await listActiveSubscribers();
  const vacancies = await listNotifyVacancies(lookbackSince(now));

  const groupKeys = [...new Set(vacancies.map((item) => notifyGroupKey(item)))];
  const delivered = new Map<string, Set<string>>();
  const sentInHour = new Map<string, number>();
  const sinceHour = hourAgo(now);

  await Promise.all(
    subscribers.map(async (subscriber) => {
      const [keys, hourCount] = await Promise.all([
        listDeliveredGroupKeys(subscriber.id, groupKeys),
        countDeliveriesSince(subscriber.id, sinceHour),
      ]);
      delivered.set(subscriber.id, keys);
      sentInHour.set(subscriber.id, hourCount);
    }),
  );

  const { planned, skippedDup, skippedRate, skippedMismatch } = planDeliveries(
    subscribers,
    vacancies,
    delivered,
    sentInHour,
  );
  const byId = new Map(subscribers.map((item) => [item.id, item]));

  const batch = planned.slice(0, limit);
  let sent = 0;
  let extraDup = 0;
  let stoppedEarly = false;

  for (const item of batch) {
    if (Date.now() - started > deadlineMs) {
      stoppedEarly = true;
      break;
    }
    const subscriber = byId.get(item.subscriberId);
    if (!subscriber) {
      continue;
    }
    const text = formatVacancyMessage(item.vacancy);
    const markup = vacancyOpenKeyboard(vacancyPublicUrl(item.vacancy.citySlug, item.vacancy.slug));
    let result = await sendTelegramMessage(subscriber.chatId, text, markup);
    if (result.retryAfterSec) {
      await sleep(Math.min(result.retryAfterSec, 5) * 1000);
      result = await sendTelegramMessage(subscriber.chatId, text, markup);
    }
    if (result.blocked) {
      await markSubscriberBlocked(subscriber.id);
      continue;
    }
    if (!result.ok) {
      continue;
    }
    const recorded = await recordDelivery({
      telegramUserId: subscriber.id,
      vacancyId: item.vacancy.id,
      groupKey: item.groupKey,
    });
    if (!recorded) {
      extraDup += 1;
      continue;
    }
    sent += 1;
    await sleep(TELEGRAM_SEND_PAUSE_MS);
  }

  const remaining = Math.max(0, planned.length - sent - extraDup);

  return {
    ok: true,
    done: remaining === 0 && !stoppedEarly,
    sent,
    skippedDup: skippedDup + extraDup,
    skippedRate,
    skippedMismatch,
    remaining,
    subscribers: subscribers.length,
    vacancies: vacancies.length,
    elapsedMs: Date.now() - started,
  };
}

export function maxPerHour(): number {
  return TELEGRAM_MAX_PER_HOUR;
}
