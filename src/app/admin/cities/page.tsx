import { requireAdmin } from "@/lib/admin/auth";
import { cityStatusLabel, listAdminCities } from "@/lib/admin/cities";

export default async function CitiesAdminPage() {
  await requireAdmin();
  const rows = await listAdminCities();
  return (
    <>
      <h1 className="text-xl">Города</h1>
      <p className="mt-2">
        Статус города живёт в <code>shared/geo.json</code>, кнопки здесь нет. Так безопаснее: включить Донецк — это не
        клик в админке, а решение в файле, которое проходит через git. Вместе со статусом открываются страницы, приём
        парсера, фильтры и статистика. Случайный клик в таблице мог бы опубликовать город, к которому продукт ещё не
        готов.
      </p>
      <table className="admin-table mt-4">
        <thead>
          <tr>
            <th>Город</th>
            <th>Статус</th>
            <th>Собрано</th>
            <th>На сайте</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.slug}>
              <td>
                {row.name} <span className="admin-kicker">{row.slug}</span>
              </td>
              <td>{cityStatusLabel(row.status)}</td>
              <td>{row.collected}</td>
              <td>{row.active}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
