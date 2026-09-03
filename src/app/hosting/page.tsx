import { SiteChrome } from "@/components/layout/SiteChrome";
import { SupportMethodCard } from "@/components/support/SupportMethodCard";
import { formatRubles } from "@/lib/format/money";
import { CITY_COOKIE, getDefaultCity, isSelectableCity } from "@/lib/geo";
import { getRequestQuality } from "@/lib/quality/request";
import { pageMetadata } from "@/lib/seo/meta";
import {
  getSupportConfig,
  getSupportExpenses,
  getSupportGoal,
  getSupportMethods,
  getSupportReports,
  isSupportEnabled,
} from "@/lib/support";
import {
  SUPPORT_EXPENSES_HEADING,
  SUPPORT_GOAL_HEADING,
  SUPPORT_METHODS_HEADING,
  SUPPORT_NON_MONEY_HEADING,
  SUPPORT_NO_MIN,
  SUPPORT_PAGE_DESCRIPTION,
  SUPPORT_PAGE_HEADING,
  SUPPORT_PAGE_TITLE,
  SUPPORT_REPORTS_EMPTY,
  SUPPORT_REPORTS_HEADING,
} from "@/lib/support/copy";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  if (!isSupportEnabled()) {
    return {
      title: "Не найдено",
      robots: { index: false, follow: false },
    };
  }
  return pageMetadata({
    title: SUPPORT_PAGE_TITLE,
    description: SUPPORT_PAGE_DESCRIPTION,
    pathname: "/support",
  });
}

function firstQuery(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

async function cityFromCookie(): Promise<string> {
  const jar = await cookies();
  const value = jar.get(CITY_COOKIE)?.value;
  if (value && isSelectableCity(value)) {
    return value;
  }
  return getDefaultCity().slug;
}

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!isSupportEnabled()) {
    notFound();
  }

  const citySlug = await cityFromCookie();
  const { mode } = await getRequestQuality();
  const query = await searchParams;
  const revealId = firstQuery(query.qr);
  const config = getSupportConfig();
  const goal = getSupportGoal();
  const expenses = getSupportExpenses();
  const methods = getSupportMethods();
  const reports = getSupportReports();
  const expenseTotal = expenses.reduce((sum, row) => sum + row.amount, 0);
  const progress = `${goal.percent}%`;

  return (
    <SiteChrome citySlug={citySlug}>
      <article className="mx-auto flex max-w-container min-w-0 flex-col gap-6 px-4 py-8">
        <header className="flex min-w-0 flex-col gap-2">
          <h1 className="font-display text-2xl font-medium">{SUPPORT_PAGE_HEADING}</h1>
          <p className="max-w-xl text-md">{config.intro}</p>
          <p className="max-w-xl text-sm text-muted">{SUPPORT_NO_MIN}</p>
        </header>

        <section className="flex min-w-0 flex-col gap-3">
          <h2 className="font-display text-xl font-medium">{SUPPORT_EXPENSES_HEADING}</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-0 border-collapse text-md">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 pr-4 font-medium">Статья</th>
                  <th className="py-2 pr-4 font-medium">В месяц</th>
                  <th className="py-2 font-medium">Комментарий</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((row) => (
                  <tr key={row.name} className="border-b border-border">
                    <td className="py-2 pr-4">{row.name}</td>
                    <td className="py-2 pr-4">{formatRubles(row.amount)}</td>
                    <td className="py-2 text-muted">{row.note}</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-2 pr-4 font-medium">Всего</td>
                  <td className="py-2 pr-4 font-medium">{formatRubles(expenseTotal)}</td>
                  <td className="py-2" />
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="flex min-w-0 flex-col gap-3">
          <h2 className="font-display text-xl font-medium">{SUPPORT_GOAL_HEADING}</h2>
          <p className="max-w-xl">
            {goal.monthLabel}: собрано {goal.collectedLabel} из {goal.targetLabel}
            {goal.target > 0 ? ` (${goal.percent} %)` : ""}.
          </p>
          <div
            className="h-2 max-w-xl overflow-hidden rounded-pill bg-surface-muted"
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={goal.percent}
            aria-label={`Собрано ${goal.percent} процентов цели`}
          >
            <div
              className="support-goal-fill"
              style={{ "--t-support-progress": progress }}
            />
          </div>
          <p className="max-w-xl text-sm text-muted">{goal.note}</p>
        </section>

        <section className="flex min-w-0 flex-col gap-3">
          <h2 className="font-display text-xl font-medium">{SUPPORT_METHODS_HEADING}</h2>
          <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
            {methods.map((method) => (
              <SupportMethodCard
                key={method.id}
                method={method}
                mode={mode}
                revealQr={revealId === method.id}
              />
            ))}
          </div>
        </section>

        <section className="flex min-w-0 flex-col gap-3">
          <h2 className="font-display text-xl font-medium">{SUPPORT_NON_MONEY_HEADING}</h2>
          <ul className="flex min-w-0 list-disc flex-col gap-3 pl-5">
            {config.nonMoney.map((item) => (
              <li key={item.title} className="min-w-0 max-w-xl">
                <p className="font-medium">{item.title}</p>
                <p className="text-sm text-muted">{item.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="reports" className="flex min-w-0 flex-col gap-3">
          <h2 className="font-display text-xl font-medium">{SUPPORT_REPORTS_HEADING}</h2>
          {reports.length === 0 ? (
            <p className="max-w-xl text-sm text-muted">{SUPPORT_REPORTS_EMPTY}</p>
          ) : (
            <ul className="flex min-w-0 list-disc flex-col gap-1 pl-5">
              {reports.map((row) => (
                <li key={row.period}>
                  <a
                    href={row.href}
                    className="text-brand underline-offset-2 hover:underline"
                  >
                    {row.title}
                  </a>
                </li>
              ))}
            </ul>
          )}
          <p className="text-sm text-muted">Обновлено {config.updatedAt}.</p>
        </section>

        <p className="text-sm">
          <Link href={`/${citySlug}/jobs`} className="text-brand underline-offset-2 hover:underline">
            К вакансиям
          </Link>
        </p>
      </article>
    </SiteChrome>
  );
}
