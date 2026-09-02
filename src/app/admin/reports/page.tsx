import { requireAdmin } from "@/lib/admin/auth";
import { listReports } from "@/lib/admin/reports";
import { AdminNotice } from "@/app/admin/notice";
import { reportDismissAction, reportHideAction } from "@/app/admin/actions";
import { buttonVariants } from "@/components/ui/button-variants";
import { vacancyPath } from "@/lib/vacancy/path";
import Link from "next/link";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const query = await searchParams;
  const items = await listReports();
  return (
    <>
      <AdminNotice query={query} />
      <h1 className="text-xl">Жалобы</h1>
      <p className="mt-2">
        Срок реакции виден в каждой строке. Жалоба «похоже на мошенничество» поднимает объявление наверх своей очереди:
        посты — в очередь одобрения, карточки кабинета — в очередь кабинета. Несколько таких жалоб скрывают карточку до
        разбора. Люди замечают то, чего не заметит ни одно правило.
      </p>
      {items.length === 0 ? <p className="mt-4">Новых жалоб нет.</p> : null}
      {items.map((item) => (
        <article key={item.id} className="mt-4 border-t border-border pt-3">
          <p>
            <Link href={vacancyPath(item.citySlug, item.vacancySlug)}>{item.vacancyTitle}</Link> · {item.cityName}
          </p>
          <p>
            {item.reasonLabel}
            {item.reason === "fraud"
              ? item.fromCabinet
                ? " · в очереди кабинета выше"
                : " · в очереди одобрения выше"
              : ""}
          </p>
          {item.comment ? <p>{item.comment}</p> : null}
          <p className={item.stale ? "admin-badge admin-badge-warn" : "admin-kicker"}>
            Ждёт {item.waitLabel}
            {item.stale ? " · больше суток" : ""}
          </p>
          <div className="admin-actions">
            <form action={reportHideAction}>
              <input type="hidden" name="id" value={item.id} />
              <button type="submit" className={buttonVariants({ variant: "danger", size: "sm" })}>
                Скрыть вакансию
              </button>
            </form>
            <form action={reportDismissAction}>
              <input type="hidden" name="id" value={item.id} />
              <button type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>
                Отклонить жалобу
              </button>
            </form>
            <Link
              href={item.fromCabinet ? `/admin/employers/queue?id=${item.vacancyId}` : `/admin/queue?id=${item.vacancyId}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              {item.fromCabinet ? "В очередь кабинета" : "В очередь одобрения"}
            </Link>
          </div>
        </article>
      ))}
    </>
  );
}
