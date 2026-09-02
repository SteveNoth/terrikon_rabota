import { requireAdmin } from "@/lib/admin/auth";
import { formatPercent } from "@/lib/admin/format";
import { formatTimeShort } from "@/lib/format/date";
import { collectHealth } from "@/lib/health";
import { adminChatId } from "@/lib/health/watch";
import { loadRumDashboard } from "@/lib/rum/stats";
import type { QualityMode } from "@/lib/quality/types";

const MODE_LABEL: Record<QualityMode, string> = {
  full: "Full",
  lite: "Lite",
  ultra: "Ultra Lite",
};

function statusLabel(status: string): string {
  if (status === "ok") {
    return "всё живо";
  }
  if (status === "degraded") {
    return "сайт работает, парсеры просели";
  }
  return "база или миграции не в порядке";
}

function ms(value: number | null, digits = 0): string {
  if (value == null) {
    return "—";
  }
  return `${value.toFixed(digits)} мс`;
}

export default async function AdminHealthPage() {
  await requireAdmin();
  const [health, rum] = await Promise.all([collectHealth(), loadRumDashboard(7)]);
  const ultra = rum.modes.find((row) => row.mode === "ultra");
  const chat = adminChatId();

  return (
    <>
      <h1 className="text-xl">Наблюдаемость</h1>
      <p className="admin-kicker mt-2">
        Состояние с `/api/health`, парсеры, размер базы и доля режимов за {rum.days} дней. Это не кабинет статистики
        рынка — только техника.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Stat label="Статус" value={statusLabel(health.status)} hint={`HTTP ${health.status === "down" ? 503 : 200}`} />
        <Stat
          label="База"
          value={health.database.limitShare}
          hint={`${health.database.sizeLabel} из 500 МБ · ответ ${health.database.latencyMs} мс`}
        />
        <Stat label="Активных вакансий" value={String(health.vacancies.active)} />
        <Stat
          label="Ultra Lite"
          value={ultra && rum.total > 0 ? formatPercent(ultra.samples, rum.total) : "пока нет замеров"}
          hint="доля заходов с режимом ultra — цифра Этапа 10"
        />
      </div>

      <h2 className="mt-6 text-lg">Миграции</h2>
      {health.migrations.ok ? (
        <p>Накатано {health.migrations.applied}.</p>
      ) : (
        <p>
          Не хватает: {health.migrations.pending.length ? health.migrations.pending.join(", ") : "список неизвестен"}.
          Пока так, сайт может врать схемой.
        </p>
      )}

      <h2 className="mt-6 text-lg">Парсеры</h2>
      <table className="admin-table mt-3">
        <thead>
          <tr>
            <th>Парсер</th>
            <th>Последний запуск</th>
            <th>Принято в нём</th>
            <th>Состояние</th>
          </tr>
        </thead>
        <tbody>
          {health.parsers.map((row) => (
            <tr key={row.parser}>
              <td>{row.label}</td>
              <td>{row.lastStartedAt ? formatTimeShort(row.lastStartedAt) : "ещё не было"}</td>
              <td>{row.lastAccepted == null ? "—" : String(row.lastAccepted)}</td>
              <td>
                {row.stale ? `нет запусков больше ${row.staleAfterHours} ч` : "по расписанию"}
                {row.zeroAcceptedTwice ? " · ноль вакансий два раза подряд" : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="admin-kicker mt-2">
        Тревога в Telegram: {chat ? "чат задан" : "TELEGRAM_ADMIN_CHAT_ID пуст — сообщения не уйдут"}. Повтор одной и
        той же поломки — не чаще чем раз в 6 часов.
      </p>

      <h2 className="mt-6 text-lg">Режимы качества (реальные заходы)</h2>
      {rum.total === 0 ? (
        <p>
          Замеров ещё нет. Full и Lite присылают LCP/CLS/INP из браузера. Ultra пишется на сервере: в экономной версии
          нет JavaScript, поэтому там только факт захода, без LCP.
        </p>
      ) : (
        <table className="admin-table mt-3">
          <thead>
            <tr>
              <th>Режим</th>
              <th>Заходов</th>
              <th>Доля</th>
              <th>LCP p75</th>
              <th>CLS p75</th>
              <th>INP p75</th>
            </tr>
          </thead>
          <tbody>
            {rum.modes.map((row) => (
              <tr key={row.mode}>
                <td>{MODE_LABEL[row.mode]}</td>
                <td>{row.samples}</td>
                <td>{formatPercent(row.samples, rum.total)}</td>
                <td>{ms(row.lcpP75)}</td>
                <td>{row.clsP75 == null ? "—" : String(row.clsP75)}</td>
                <td>{ms(row.inpP75)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 className="mt-6 text-lg">Если проект Supabase «уснул»</h2>
      <p>
        Бесплатный проект без запросов к базе около недели ставится на паузу. Сайт тогда отдаёт ошибки, а{" "}
        <code>/api/health</code> — 503 или зависает на первом пинге. В кабинете Supabase статус Paused. Первый живой
        запрос будит проект (часто 30–90 секунд). Расписание GitHub Actions раз в 3 дня дергает health как раз чтобы
        паузы не случилось. Если Actions сами затихли (нет пушей 60 дней) — пауза снова возможна.
      </p>
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="admin-stat">
      <span className="admin-kicker">{label}</span>
      <b>{value}</b>
      {hint ? <span className="admin-kicker">{hint}</span> : null}
    </div>
  );
}
