import { formatRubles } from "@/lib/format/money";
import { methodAriaLabel, getSupportConfig, getSupportExpenses, getSupportGoal, getSupportMethods, getSupportReports, isSupportEnabled } from "@/lib/support";
import {
  SUPPORT_SHOWN_PATH,
  canShowSupportAskFrom,
  supportDismissHref,
  type CookieReader,
} from "@/lib/support/ask";
import {
  SUPPORT_DISMISS_LABEL,
  SUPPORT_EXPENSES_HEADING,
  SUPPORT_FOOTER_LEAD,
  SUPPORT_FOOTER_LINK,
  SUPPORT_GOAL_HEADING,
  SUPPORT_HEADER_LABEL,
  SUPPORT_INLINE_BUTTON,
  SUPPORT_INLINE_TEXT,
  SUPPORT_METHODS_HEADING,
  SUPPORT_NAV_LABEL,
  SUPPORT_NON_MONEY_HEADING,
  SUPPORT_NO_MIN,
  SUPPORT_PAGE_DESCRIPTION,
  SUPPORT_PAGE_HEADING,
  SUPPORT_PAGE_TITLE,
  SUPPORT_REPORTS_EMPTY,
  SUPPORT_REPORTS_HEADING,
} from "@/lib/support/copy";
import { attr, esc } from "@/ultra/html";

export function supportHeaderLink(): string {
  if (!isSupportEnabled()) {
    return "";
  }
  return `<a class="btn btn-ghost tr-support-flame" href="/support" aria-label="${attr(SUPPORT_HEADER_LABEL)}">♥</a>`;
}

export function supportFooterLine(): string {
  if (!isSupportEnabled()) {
    return "";
  }
  return `<p class="small">${esc(SUPPORT_FOOTER_LEAD)} <a href="/support">${esc(SUPPORT_FOOTER_LINK)}</a></p>`;
}

export function supportNavLink(currentPath: string): string {
  if (!isSupportEnabled()) {
    return "";
  }
  const current = currentPath === "/support" || currentPath.startsWith("/support/");
  return `<a href="/support"${current ? ' aria-current="page"' : ""}>${esc(SUPPORT_NAV_LABEL)}</a>`;
}

export function supportNavClass(): string {
  return isSupportEnabled() ? " bottom-4" : "";
}

export function renderSupportAskCard(nextPath: string, readCookie: CookieReader): string {
  if (!canShowSupportAskFrom(readCookie)) {
    return "";
  }
  return `<div class="card stack tight">
<iframe class="sr-only" src="${attr(SUPPORT_SHOWN_PATH)}" title="" aria-hidden="true" tabindex="-1"></iframe>
<p>${esc(SUPPORT_INLINE_TEXT)}</p>
<p><a class="btn btn-outline" href="/support">${esc(SUPPORT_INLINE_BUTTON)}</a> <a class="btn btn-ghost" href="${attr(supportDismissHref(nextPath))}">${esc(SUPPORT_DISMISS_LABEL)}</a></p>
</div>`;
}

export function renderSupportPage(): { title: string; description: string; body: string } | null {
  if (!isSupportEnabled()) {
    return null;
  }

  const config = getSupportConfig();
  const goal = getSupportGoal();
  const expenses = getSupportExpenses();
  const methods = getSupportMethods();
  const reports = getSupportReports();
  const expenseTotal = expenses.reduce((sum, row) => sum + row.amount, 0);

  const expenseRows = expenses
    .map(
      (row) =>
        `<tr><td>${esc(row.name)}</td><td>${esc(formatRubles(row.amount))}</td><td class="muted">${esc(row.note)}</td></tr>`,
    )
    .join("");

  const methodCards = methods
    .map((method) => {
      const link = method.url
        ? `<p><a class="btn btn-outline" href="${attr(method.url)}" rel="noopener noreferrer" target="_blank" aria-label="${attr(methodAriaLabel(method))}">Открыть ${esc(method.name)}</a></p>`
        : "";
      return `<div class="card stack tight">
<h3>${esc(method.name)}</h3>
${method.caption ? `<p class="muted small">${esc(method.caption)}</p>` : ""}
${method.requisite ? `<p class="salary">${esc(method.requisite)}</p>` : ""}
${link}
</div>`;
    })
    .join("");

  const nonMoney = config.nonMoney
    .map(
      (item) =>
        `<li><p class="salary">${esc(item.title)}</p><p class="muted small">${esc(item.text)}</p></li>`,
    )
    .join("");

  const reportList =
    reports.length === 0
      ? `<p class="muted small">${esc(SUPPORT_REPORTS_EMPTY)}</p>`
      : `<ul class="list">${reports
          .map((row) => `<li><a href="${attr(row.href)}">${esc(row.title)}</a></li>`)
          .join("")}</ul>`;

  const body = `<article class="wrap article">
<header class="stack tight">
<h1>${esc(SUPPORT_PAGE_HEADING)}</h1>
<p>${esc(config.intro)}</p>
<p class="muted small">${esc(SUPPORT_NO_MIN)}</p>
</header>
<section class="stack tight">
<h2>${esc(SUPPORT_EXPENSES_HEADING)}</h2>
<div class="card">
<table>
<thead><tr><th>Статья</th><th>В месяц</th><th>Комментарий</th></tr></thead>
<tbody>
${expenseRows}
<tr><td class="salary">Всего</td><td class="salary">${esc(formatRubles(expenseTotal))}</td><td></td></tr>
</tbody>
</table>
</div>
</section>
<section class="stack tight">
<h2>${esc(SUPPORT_GOAL_HEADING)}</h2>
<p>${esc(goal.monthLabel)}: собрано ${esc(goal.collectedLabel)} из ${esc(goal.targetLabel)}${goal.target > 0 ? ` (${goal.percent} %)` : ""}.</p>
<p class="muted small">${esc(goal.note)}</p>
</section>
<section class="stack tight">
<h2>${esc(SUPPORT_METHODS_HEADING)}</h2>
${methodCards}
</section>
<section class="stack tight">
<h2>${esc(SUPPORT_NON_MONEY_HEADING)}</h2>
<ul class="plain stack tight">${nonMoney}</ul>
</section>
<section class="stack tight" id="reports">
<h2>${esc(SUPPORT_REPORTS_HEADING)}</h2>
${reportList}
<p class="muted small">Обновлено ${esc(config.updatedAt)}.</p>
</section>
</article>`;

  return { title: SUPPORT_PAGE_TITLE, description: SUPPORT_PAGE_DESCRIPTION, body };
}
