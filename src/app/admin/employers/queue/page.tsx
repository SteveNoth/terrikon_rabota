import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { getEmployerQueueItem, listEmployerQueue, employerQueueSummary, statusCountLabel } from "@/lib/admin/employer-queue";
import { highlightParts } from "@/lib/admin/highlight";
import { AdminNotice, firstParam } from "@/app/admin/notice";
import { CabinetQueueHotkeys } from "@/app/admin/hotkeys";
import {
  cabinetDisablePublishAction,
  cabinetForbiddenAction,
  cabinetPublishAction,
  cabinetPublishTrustAction,
  cabinetPublishVerifyAction,
  cabinetRejectAction,
  cabinetRestoreAction,
} from "@/app/admin/actions";
import { buttonVariants } from "@/components/ui/button-variants";
import { formatDate } from "@/lib/format/date";
import { vacancyPath } from "@/lib/vacancy/path";

export default async function EmployerQueuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const query = await searchParams;
  const employerId = firstParam(query.employerId);
  const requestedId = firstParam(query.id);
  const [items, summary] = await Promise.all([listEmployerQueue(employerId), employerQueueSummary(employerId)]);
  const fromList = items.find((item) => item.id === requestedId) ?? items[0] ?? null;
  const current =
    requestedId && fromList?.id !== requestedId ? ((await getEmployerQueueItem(requestedId)) ?? fromList) : fromList;

  return (
    <>
      <CabinetQueueHotkeys />
      <AdminNotice query={query} />
      <h1 className="text-xl">Очередь кабинета</h1>
      <p className="mt-2">
        В очереди {summary.total}
        {summary.oldestLabel ? ` · самый старый пункт ждёт ${summary.oldestLabel}` : ""}. Это карточки с формы
        работодателя, не посты парсера. Таймер их сам не публикует.
      </p>
      {employerId ? (
        <p className="mt-2">
          Фильтр по работодателю. <Link href="/admin/employers/queue">Показать всех</Link>
        </p>
      ) : null}

      {current ? (
        <QueueCard item={current} employerId={employerId} />
      ) : (
        <p className="mt-4">Очередь пуста. Сомнительные объявления из кабинета ждут здесь и сами на сайт не выходят.</p>
      )}

      {items.length > 1 ? (
        <ol className="mt-6">
          {items.slice(0, 40).map((item) => (
            <li key={item.id}>
              <Link href={queueHref(item.id, employerId)}>
                {item.highRisk ? "высокий риск · " : ""}
                {item.fraudReportCount ? `жалоб ${item.fraudReportCount} · ` : ""}
                {item.companyName}: {item.title} · {item.waitLabel}
              </Link>
            </li>
          ))}
        </ol>
      ) : null}
    </>
  );
}

function queueHref(id: string, employerId?: string) {
  const params = new URLSearchParams({ id });
  if (employerId) {
    params.set("employerId", employerId);
  }
  return `/admin/employers/queue?${params.toString()}`;
}

function QueueCard({
  item,
  employerId,
}: {
  item: Awaited<ReturnType<typeof listEmployerQueue>>[number];
  employerId?: string;
}) {
  const parts = highlightParts(item.description, item.flags);
  return (
    <article>
      <p className="admin-kicker">
        {item.highRisk ? <span className="admin-badge admin-badge-danger">высокий риск</span> : null}{" "}
        {item.marks.complaint ? <span className="admin-badge admin-badge-danger">жалоба</span> : null}{" "}
        {item.marks.newContact ? <span className="admin-badge">новый контакт</span> : null}{" "}
        {item.marks.unverifiedCompany ? <span className="admin-badge">компания не проверена</span> : null}{" "}
        {item.marks.weakFraud ? <span className="admin-badge admin-badge-warn">слабый обман</span> : null}{" "}
        trustScore {item.trustScore}
        {item.fraudReportCount ? ` · жалоб «похоже на мошенничество»: ${item.fraudReportCount}` : ""} · статус{" "}
        {item.moderationStatus}
      </p>
      <h2 className="mt-2 text-lg">{item.title}</h2>
      <p>
        {item.companyName} · {item.companyCity}
        {item.isVerified ? " · проверенная компания" : " · без отметки «проверен»"}
      </p>
      <p className="admin-kicker">
        Аккаунт: {item.accountName} · {item.accountEmail}
        {item.publishBlocked ? " · публикация отключена" : ""}
      </p>
      <p className="admin-kicker">Вакансии аккаунта: {statusCountLabel(item.vacancyCounts)}</p>
      <p className="admin-kicker">
        {item.cityName} · в очереди {item.waitLabel} ·{" "}
        <Link href={vacancyPath(item.citySlug, item.slug)}>карточка</Link>
        {item.employerId ? (
          <>
            {" · "}
            <Link href={`/admin/employers/queue?employerId=${item.employerId}`}>все этого работодателя</Link>
          </>
        ) : null}
      </p>

      <h3 className="mt-4">Поля формы</h3>
      <ul>
        <li>Название: {item.title}</li>
        <li>Зарплата: {item.salaryText}</li>
        <li>Профессия: {item.professionName}</li>
        <li>Формат: {item.workFormatLabel}</li>
        <li>
          Контакты: {[item.contactPhone, item.contactTelegram, item.contactEmail].filter(Boolean).join(" · ") || "нет"}
        </li>
      </ul>

      <h3 className="mt-4">Описание</h3>
      <pre className="admin-pre">
        {parts.map((part, index) => (part.marked ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>))}
      </pre>

      {item.salaryLine ? (
        <p className="mt-3">
          <strong>Деньги против медианы:</strong> {item.salaryLine}
        </p>
      ) : null}

      <h3 className="mt-4">Правила</h3>
      <ul>
        {item.flags.map((flag) => (
          <li key={flag.id}>
            {flag.label} ({flag.id}) {flag.points ? `−${flag.points}` : flag.hard ? "жёсткий" : "метка"}
            {flag.detail ? ` — ${flag.detail}` : ""}
            {flag.sample ? ` «${flag.sample}»` : ""}
          </li>
        ))}
        {item.flags.length === 0 ? <li>Нет сработавших фраз — скорее всего новый контакт или непроверенная компания.</li> : null}
      </ul>
      <p>Итоговый trustScore: {item.trustScore}</p>

      <h3 className="mt-4">Контакт</h3>
      <p>
        {item.contactPhone || item.contactTelegram || item.contactEmail || "нет контакта"}
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

      <div className="admin-actions">
        <form action={cabinetPublishAction}>
          <input type="hidden" name="id" value={item.id} />
          {employerId ? <input type="hidden" name="employerId" value={employerId} /> : null}
          <button id="cabinet-publish" type="submit" className={buttonVariants({ variant: "primary", size: "sm" })}>
            Опубликовать (P)
          </button>
        </form>
        <form action={cabinetPublishTrustAction}>
          <input type="hidden" name="id" value={item.id} />
          {employerId ? <input type="hidden" name="employerId" value={employerId} /> : null}
          <button id="cabinet-trust" type="submit" className={buttonVariants({ variant: "accent", size: "sm" })}>
            Опубликовать и доверять контакту (T)
          </button>
        </form>
        <form action={cabinetPublishVerifyAction}>
          <input type="hidden" name="id" value={item.id} />
          {employerId ? <input type="hidden" name="employerId" value={employerId} /> : null}
          <button id="cabinet-verify" type="submit" className={buttonVariants({ variant: "accent", size: "sm" })}>
            Опубликовать и отметить компанию проверенной (V)
          </button>
        </form>
        <form action={cabinetRejectAction}>
          <input type="hidden" name="id" value={item.id} />
          {employerId ? <input type="hidden" name="employerId" value={employerId} /> : null}
          <label className="admin-field mb-0">
            Что сказать работодателю
            <input name="note" maxLength={280} placeholder="необязательно, без обвинения" />
          </label>
          <button id="cabinet-reject" type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Отклонить (R)
          </button>
        </form>
        <form action={cabinetForbiddenAction}>
          <input type="hidden" name="id" value={item.id} />
          {employerId ? <input type="hidden" name="employerId" value={employerId} /> : null}
          <button id="cabinet-forbidden" type="submit" className={buttonVariants({ variant: "danger", size: "sm" })}>
            Запрещённый текст (B)
          </button>
        </form>
        <form action={cabinetDisablePublishAction}>
          <input type="hidden" name="id" value={item.id} />
          {employerId ? <input type="hidden" name="employerId" value={employerId} /> : null}
          <button
            id="cabinet-disable-publish"
            type="submit"
            className={buttonVariants({ variant: "danger", size: "sm" })}
            disabled={!item.accountUserId}
          >
            Отключить публикацию аккаунта (U)
          </button>
        </form>
        <form action={cabinetRestoreAction}>
          <input type="hidden" name="id" value={item.id} />
          {employerId ? <input type="hidden" name="employerId" value={employerId} /> : null}
          <button id="cabinet-restore" type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Это ошибка, вернуть (E)
          </button>
        </form>
      </div>
    </article>
  );
}
