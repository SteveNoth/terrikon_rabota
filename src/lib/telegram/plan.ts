import { remainingHourQuota, vacancyMatchesSubscription } from "@/lib/telegram/match";

export type PlanVacancy = {
  id: string;
  title: string;
  summaryLine: string | null;
  professionSlug: string | null;
  sphere: string;
  citySlug: string;
  groupId: string | null;
  publishedAt: Date;
};

export type PlanSubscriber = {
  id: string;
  citySlug: string;
  keywords: string[];
  spheres: string[];
  createdAt: Date;
};

export type PlannedSend<V extends PlanVacancy = PlanVacancy> = {
  subscriberId: string;
  vacancy: V;
  groupKey: string;
};

export function groupKeyOf(vacancy: { id: string; groupId: string | null }): string {
  return vacancy.groupId || vacancy.id;
}

export function planDeliveries<V extends PlanVacancy>(
  subscribers: PlanSubscriber[],
  vacancies: V[],
  delivered: Map<string, Set<string>>,
  sentInHour: Map<string, number>,
): { planned: PlannedSend<V>[]; skippedDup: number; skippedRate: number; skippedMismatch: number } {
  const planned: PlannedSend<V>[] = [];
  let skippedDup = 0;
  let skippedRate = 0;
  let skippedMismatch = 0;
  const usedThisRun = new Map<string, number>();

  for (const subscriber of subscribers) {
    const already = delivered.get(subscriber.id) ?? new Set();
    let quota = remainingHourQuota(sentInHour.get(subscriber.id) ?? 0);
    quota = Math.max(0, quota - (usedThisRun.get(subscriber.id) ?? 0));

    for (const vacancy of vacancies) {
      if (vacancy.publishedAt < subscriber.createdAt) {
        continue;
      }
      if (!vacancyMatchesSubscription(vacancy, subscriber)) {
        skippedMismatch += 1;
        continue;
      }
      const groupKey = groupKeyOf(vacancy);
      if (already.has(groupKey)) {
        skippedDup += 1;
        continue;
      }
      if (quota <= 0) {
        skippedRate += 1;
        continue;
      }
      planned.push({ subscriberId: subscriber.id, vacancy, groupKey });
      already.add(groupKey);
      quota -= 1;
      usedThisRun.set(subscriber.id, (usedThisRun.get(subscriber.id) ?? 0) + 1);
    }
  }

  return { planned, skippedDup, skippedRate, skippedMismatch };
}
