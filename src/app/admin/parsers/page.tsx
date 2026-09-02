import { requireAdmin } from "@/lib/admin/auth";
import { loadParserStats } from "@/lib/admin/parsers";
import { ParserDayChart } from "@/lib/admin/parser-chart";
import { formatDate, formatTimeShort } from "@/lib/format/date";
import { formatPercent } from "@/lib/admin/format";

export default async function ParsersPage() {
  await requireAdmin();
  const stats = await loadParserStats(14);

  return (
    <>
      <h1 className="text-xl">Статистика парсеров</h1>
      <p className="mt-2 admin-kicker">По данным ParserRun. Цифры — запуски, не догадки.</p>

      <h2 className="mt-4 text-lg">По дням</h2>
      <ParserDayChart days={stats.days} />
      <table className="admin-table mt-3">
        <thead>
          <tr>
            <th>День</th>
            <th>Собрано</th>
            <th>Принято</th>
            <th>Спорных</th>
            <th>Отброшено</th>
            <th>Заблокировано</th>
          </tr>
        </thead>
        <tbody>
          {stats.days.map((day) => (
            <tr key={day.date}>
              <td>{day.date}</td>
              <td>{day.seen}</td>
              <td>{day.accepted}</td>
              <td>{day.pending}</td>
              <td>{day.rejected}</td>
              <td>{day.blocked}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="admin-kicker mt-2">
        Серый — собрано, синий — принято, жёлтый — спорных, зелёный — отброшено, красный — заблокировано.
      </p>

      <h2 className="mt-6 text-lg">Топ причин отказа</h2>
      <ul>
        {stats.reasonTop.map((row) => (
          <li key={row.reason}>
            {row.reason}: {row.count}
          </li>
        ))}
        {stats.reasonTop.length === 0 ? <li>Пока нет снимка причин — появятся после новых запусков парсеров.</li> : null}
      </ul>

      <h2 className="mt-6 text-lg">Доля мошеннических по источникам</h2>
      <p className="admin-kicker">Прямая подсказка, какую группу пора перестать читать.</p>
      <ul>
        {stats.fraudShareBySource.map((row) => (
          <li key={row.source}>
            {row.label}: {formatPercent(row.blocked, row.total)} ({row.blocked} из {row.total})
          </li>
        ))}
        {stats.fraudShareBySource.length === 0 ? <li>Заблокированных пока нет.</li> : null}
      </ul>

      <h2 className="mt-6 text-lg">Последний запуск</h2>
      <ul>
        {stats.health.map((row) => (
          <li key={row.parser}>
            {row.label}: {row.lastStartedAt ? formatTimeShort(row.lastStartedAt) : "ещё не запускался"}
            {row.stale ? ` · нет запусков больше ${row.staleAfterHours} ч — парсер, похоже, затих` : ""}
          </li>
        ))}
      </ul>
      <p className="admin-kicker">{formatDate(new Date())}</p>
    </>
  );
}
