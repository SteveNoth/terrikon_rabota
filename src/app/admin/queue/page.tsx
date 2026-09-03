import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { listDuplicateCandidates, listQueue, parseQueueTab, queuePath, queueSummary } from "@/lib/admin/queue";
import { ruleAccuracy } from "@/lib/admin/rules";
import { highlightParts } from "@/lib/admin/highlight";
import { AdminNotice, firstParam } from "@/app/admin/notice";
import { QueueHotkeys } from "@/app/admin/hotkeys";
import {
  queueApproveGroupAction,
  queueFraudAction,
  queueMergeAction,
  queueNotVacancyAction,
  queuePublishAction,
  queuePublishTrustAction,
} from "@/app/admin/actions";
import { buttonVariants } from "@/components/ui/button-variants";
import { formatDate } from "@/lib/format/date";
import { SOURCE_LABEL } from "@/lib/format/source";
import { vacancyPath } from "@/lib/vacancy/path";
import { formatPercent } from "@/lib/admin/format";

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const query = await searchParams;
  const tab = parseQueueTab(firstParam(query.tab));
  const [items, summary, rules] = await Promise.all([listQueue(tab), queueSummary(), ruleAccuracy()]);
  const currentId = firstParam(query.id);
  const current = items.find((item) => item.id === currentId) ?? items[0] ?? null;
  const candidates = current ? await listDuplicateCandidates(current) : [];
  const currentRules = rules.filter((rule) => rule.candidate);

  return (
    <>
      <QueueHotkeys />
      <AdminNotice query={query} />
      <h1 className="text-xl">Очередь одобрения</h1>
      <p className="mt-2">
        В очереди {summary.total}
        {summary.oldestLabel ? ` · самый старый пункт ждёт ${summary.oldestLabel}` : ""}.
        {summary.growing ? " За сутки очередь растёт быстрее, чем разбирается." : ""}
      </p>
      <p className="mt-2 text-sm">
        Карточки из кабинета работодателя — в{" "}
        <Link href="/admin/employers/queue">очереди кабинета</Link>. Клавиши: P опубликовать · D дубль · N не вакансия ·
        F мошенничество.
      </p>

      <div className="admin-tabs">
        <Tab href={queuePath("fraud")} current={tab === "fraud"}>
          Мошенничество?
        </Tab>
        <Tab href={queuePath("vacancy")} current={tab === "vacancy"}>
          Вакансия?
        </Tab>
        <Tab href={queuePath("duplicate")} current={tab === "duplicate"}>
          Дубль?
        </Tab>
        <Tab href={queuePath("all")} current={tab === "all"}>
          Все ({summary.total})
        </Tab>
      </div>

      {current ? (
        <div className="admin-queue">
          <ol className="admin-queue-list">
            {items.slice(0, 40).map((item) => (
              <li key={item.id}>
                <Link href={queuePath(tab, item.id)} aria-current={item.id === current.id ? "page" : undefined}>
                  {item.highRisk ? "высокий риск · " : ""}
                  {item.doubts.duplicate ? "дубль · " : ""}
                  {item.title} · {item.waitLabel}
                </Link>
              </li>
            ))}
          </ol>
          <QueueCard item={current} tab={tab} candidates={candidates} />
        </div>
      ) : (
        <p className="mt-4">Очередь пуста. Сомнительные объявления ждут здесь и сами на сайт не выходят.</p>
      )}

      <details className="mt-8">
        <summary>Точность правил{currentRules.length ? ` · кандидаты на понижение: ${currentRules.length}` : ""}</summary>
        <p className="admin-kicker mt-2">
          Сработало N раз, согласился M раз. Правило с низкой точностью тихо засоряет очередь.
        </p>
        {currentRules.length ? (
          <ul className="mt-3">
            {currentRules.map((rule) => (
              <li key={rule.id}>
                {rule.label} ({rule.id}): сработало {rule.fires}, согласился {rule.agreed} (
                {formatPercent(rule.agreed, rule.fires)})
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3">Пока мало решений, чтобы предлагать понижение веса.</p>
        )}
        {rules.length ? (
          <table className="admin-table mt-4">
            <thead>
              <tr>
                <th>Правило</th>
                <th>N</th>
                <th>M</th>
                <th>Точность</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td>
                    {rule.label} <span className="admin-kicker">{rule.id}</span>
                  </td>
                  <td>{rule.fires}</td>
                  <td>{rule.agreed}</td>
                  <td>{formatPercent(rule.agreed, rule.fires)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </details>
    </>
  );
}

function Tab({ href, current, children }: { href: string; current: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} aria-current={current ? "page" : undefined}>
      {children}
    </Link>
  );
}

function QueueCard({
  item,
  tab,
  candidates,
}: {
  item: Awaited<ReturnType<typeof listQueue>>[number];
  tab: ReturnType<typeof parseQueueTab>;
  candidates: Awaited<ReturnType<typeof listDuplicateCandidates>>;
}) {
  const parts = highlightParts(item.rawText, item.flags);
  const phraseDefault = item.flags.find((flag) => flag.sample && !/^\d+$/.test(flag.sample))?.sample ?? "";
  const defaultDup =
    candidates.find((row) => row.similarity >= 95)?.id ?? candidates[0]?.id ?? item.members[0]?.id ?? "";
  return (
    <article>
      <p className="admin-kicker">
        {item.highRisk ? <span className="admin-badge admin-badge-danger">высокий риск</span> : null}{" "}
        {item.doubts.fraud ? <span className="admin-badge">мошенничество?</span> : null}{" "}
        {item.doubts.vacancy ? <span className="admin-badge">вакансия?</span> : null}{" "}
        {item.doubts.duplicate ? <span className="admin-badge">дубль?</span> : null} trustScore {item.trustScore}
        {item.fraudReportCount ? ` · жалоб «похоже на мошенничество»: ${item.fraudReportCount}` : ""}
      </p>
      <h2 className="mt-2 text-lg">{item.title}</h2>
      <p className="admin-kicker">
        {item.cityName} · {SOURCE_LABEL[item.source]}
        {item.sourceName ? ` · ${item.sourceName}` : ""} · в очереди {item.waitLabel} ·{" "}
        <Link href={vacancyPath(item.citySlug, item.slug)}>карточка</Link>
      </p>

      <h3 className="mt-4">Оригинал</h3>
      <pre className="admin-pre">
        {parts.map((part, index) => (part.marked ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>))}
      </pre>
      {item.ocrText ? (
        <>
          <h3 className="mt-3">Текст с картинок</h3>
          <pre className="admin-pre">{item.ocrText}</pre>
        </>
      ) : null}

      {item.salaryLine ? (
        <p className="mt-3">
          <strong>Деньги:</strong> {item.salaryLine}
        </p>
      ) : null}

      {item.workFormat === "VAHTA" ? (
        <p className="mt-3">
          Вахта: работа {item.workLocationText || "—"}, смена {item.rotationPattern || "—"}, набор{" "}
          {item.employerKindLabel || "неизвестно кто"}.
        </p>
      ) : null}

      <h3 className="mt-4">Правила</h3>
      <ul>
        {item.flags.map((flag) => (
          <li key={flag.id}>
            {flag.label} ({flag.id}) {flag.points ? `−${flag.points}` : "жёсткий"}
            {flag.detail ? ` — ${flag.detail}` : ""}
            {flag.sample ? ` «${flag.sample}»` : ""}
          </li>
        ))}
        {item.flags.length === 0 ? <li>Нет сработавших фраз — скорее всего новый контакт.</li> : null}
      </ul>
      <p>Итоговый trustScore: {item.trustScore}</p>

      {item.members.length ? (
        <>
          <h3 className="mt-4">Группа дублей · {item.groupPostings} размещений</h3>
          <p>
            Источники: {item.groupSources.join(", ") || "—"}. Разных телефонов: {item.distinctPhones}.
          </p>
          <ul>
            {item.members.map((member) => (
              <li key={member.id}>
                {member.title} · {SOURCE_LABEL[member.source]} · сходство {member.similarity} %
                {member.contactPhone ? ` · ${member.contactPhone}` : ""}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <h3 className="mt-4">Контакт</h3>
      <p>
        {item.contactPhone || item.contactTelegram || "нет контакта"}
        {item.contactVerdict ? ` · вердикт ${item.contactVerdict}` : ""}
        {item.contactSeenBefore ? " · встречался раньше" : " · первый раз"}
      </p>
      {item.contactHistory.length ? (
        <ul>
          {item.contactHistory.map((row) => (
            <li key={`${row.vacancyId}-${row.decidedAt.toISOString()}`}>
              {formatDate(row.decidedAt)}: {row.decision} — {row.title}
            </li>
          ))}
        </ul>
      ) : (
        <p className="admin-kicker">Решений по этому контакту ещё не было.</p>
      )}

      <div className="admin-actions admin-actions-primary">
        <form action={queuePublishAction}>
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="tab" value={tab} />
          <button id="queue-publish" type="submit" className={buttonVariants({ variant: "primary", size: "sm" })}>
            Опубликовать (P)
          </button>
        </form>
        <form action={queueMergeAction}>
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="tab" value={tab} />
          <label className="admin-field mb-0">
            Это дубль вакансии…
            {candidates.length ? (
              <select id="queue-duplicate-of" name="duplicateOfId" defaultValue={defaultDup}>
                <option value="">— выбрать —</option>
                {candidates.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.similarity}% · {member.title} ({SOURCE_LABEL[member.source]})
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="queue-duplicate-of"
                name="duplicateOfId"
                placeholder="id оригинала"
                autoComplete="off"
              />
            )}
          </label>
          <button id="queue-duplicate" type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Это дубль (D)
          </button>
        </form>
        <form action={queueNotVacancyAction}>
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="tab" value={tab} />
          <label className="admin-field mb-0">
            Стоп-слово
            <input name="stopWord" />
          </label>
          <button id="queue-not-vacancy" type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Не вакансия (N)
          </button>
        </form>
        <form action={queueFraudAction}>
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="tab" value={tab} />
          <label className="admin-field mb-0">
            Фраза в словарь
            <input name="phrase" defaultValue={phraseDefault} />
          </label>
          <button id="queue-fraud" type="submit" className={buttonVariants({ variant: "danger", size: "sm" })}>
            Мошенничество (F)
          </button>
        </form>
      </div>
      <div className="admin-actions">
        <form action={queuePublishTrustAction}>
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="tab" value={tab} />
          <button id="queue-trust" type="submit" className={buttonVariants({ variant: "accent", size: "sm" })}>
            Опубликовать и доверять (T)
          </button>
        </form>
        <form action={queueApproveGroupAction}>
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="tab" value={tab} />
          <button
            id="queue-group"
            type="submit"
            className={buttonVariants({ variant: "outline", size: "sm" })}
            disabled={item.groupPostings < 2}
          >
            Одобрить всю группу (G)
          </button>
        </form>
      </div>
    </article>
  );
}
