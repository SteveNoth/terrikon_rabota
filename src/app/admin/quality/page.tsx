import { requireAdmin } from "@/lib/admin/auth";
import { listQualityQueue, qualityMetrics } from "@/lib/admin/quality";
import { diffParts } from "@/lib/admin/highlight";
import { AdminNotice } from "@/app/admin/notice";
import {
  qualityAcceptAction,
  qualityEditAction,
  qualityExportAction,
  qualityRejectAction,
} from "@/app/admin/actions";
import { buttonVariants } from "@/components/ui/button-variants";
import { formatPercent } from "@/lib/admin/format";
import { firstParam } from "@/app/admin/notice";

export default async function QualityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const query = await searchParams;
  const [metrics, items] = await Promise.all([qualityMetrics(), listQualityQueue()]);
  const currentId = firstParam(query.id);
  const current = items.find((item) => item.id === currentId) ?? items[0] ?? null;

  const processed = current
    ? [
        current.title,
        current.summaryLine,
        current.sections.description,
        ...current.sections.tasks,
        ...current.sections.requirements,
        ...current.sections.conditions,
        current.description,
      ]
        .filter(Boolean)
        .join("\n")
    : "";
  const diff = current ? diffParts(current.rawText, processed) : null;

  return (
    <>
      <AdminNotice query={query} />
      <h1 className="text-xl">Качество объявлений</h1>
      <p className="mt-2">
        Здесь замыкается главный цикл улучшения проекта. Любая правка становится парой «оригинал → правильный результат»
        в NormalizationSample. Этот набор нельзя купить — он появляется только от работы руками, поэтому кнопка «Принять
        с правкой» важнее, чем кажется: сначала тесты, потом примеры для модели, в перспективе — данные для дообучения.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="admin-stat">
          <span className="admin-kicker">Средняя полнота</span>
          <b>{metrics.avgCompleteness}</b>
        </div>
        <div className="admin-stat">
          <span className="admin-kicker">С разделами</span>
          <b>{formatPercent(metrics.withSectionsShare, 1)}</b>
        </div>
        <div className="admin-stat">
          <span className="admin-kicker">С зарплатой</span>
          <b>{formatPercent(metrics.withSalaryShare, 1)}</b>
        </div>
        <div className="admin-stat">
          <span className="admin-kicker">Правок за неделю</span>
          <b>{metrics.editsThisWeek}</b>
        </div>
      </div>
      <p className="mt-3">
        Чаще всего правил:{" "}
        {metrics.topCorrectedField
          ? `${metrics.topCorrectedField.field} (${metrics.topCorrectedField.count}) — подсказка, что чинить в shared/normalize.json`
          : "пока нет правок"}
        . В выборке {metrics.sampleCount} пар.
      </p>
      <form action={qualityExportAction} className="mt-3">
        <button type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Выгрузить выборку в tests/normalization
        </button>
      </form>

      {current && diff ? (
        <article className="mt-6">
          <h2 className="text-lg">
            {current.title} · просмотров {current.viewsCount} · полнота {current.completeness}
          </h2>
          <div className="admin-grid-2 mt-3">
            <div>
              <h3>Было (оригинал)</h3>
              <pre className="admin-pre">
                {diff.left.map((part, index) =>
                  part.marked ? (
                    <mark key={index} className="admin-mark-del">
                      {part.text}
                    </mark>
                  ) : (
                    <span key={index}>{part.text}</span>
                  ),
                )}
              </pre>
            </div>
            <div>
              <h3>Стало (обработка)</h3>
              <pre className="admin-pre">
                {diff.right.map((part, index) =>
                  part.marked ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>,
                )}
              </pre>
            </div>
          </div>
          <form id="quality-edit-form" action={qualityEditAction} className="mt-4">
            <input type="hidden" name="id" value={current.id} />
            <label className="admin-field">
              Заголовок
              <input name="title" defaultValue={current.title} />
            </label>
            <label className="admin-field">
              Сводка
              <input name="summaryLine" defaultValue={current.summaryLine ?? ""} />
            </label>
            <label className="admin-field">
              Описание
              <textarea name="description" rows={6} defaultValue={current.description} />
            </label>
            <label className="admin-field">
              Раздел описание
              <textarea name="sectionDescription" rows={3} defaultValue={current.sections.description} />
            </label>
            <label className="admin-field">
              Обязанности
              <textarea name="sectionTasks" rows={4} defaultValue={current.sections.tasks.join("\n")} />
            </label>
            <label className="admin-field">
              Требования
              <textarea name="sectionRequirements" rows={4} defaultValue={current.sections.requirements.join("\n")} />
            </label>
            <label className="admin-field">
              Условия
              <textarea name="sectionConditions" rows={4} defaultValue={current.sections.conditions.join("\n")} />
            </label>
          </form>
          <div className="admin-actions">
            <button
              type="submit"
              form="quality-edit-form"
              className={buttonVariants({ variant: "accent", size: "sm" })}
            >
              Принять с правкой
            </button>
            <form action={qualityAcceptAction}>
              <input type="hidden" name="id" value={current.id} />
              <button type="submit" className={buttonVariants({ variant: "primary", size: "sm" })}>
                Принять
              </button>
            </form>
            <form action={qualityRejectAction}>
              <input type="hidden" name="id" value={current.id} />
              <button type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>
                Отклонить обработку
              </button>
            </form>
          </div>
        </article>
      ) : (
        <p className="mt-4">Очередь качества пуста.</p>
      )}
      {items.length > 1 ? (
        <ol className="mt-6">
          {items.slice(0, 20).map((item) => (
            <li key={item.id}>
              <a href={`/admin/quality?id=${item.id}`}>
                {item.title} · просмотров {item.viewsCount} · полнота {item.completeness}
              </a>
            </li>
          ))}
        </ol>
      ) : null}
    </>
  );
}
