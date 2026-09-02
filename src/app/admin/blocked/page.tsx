import { requireAdmin } from "@/lib/admin/auth";
import { blockedBySource, listBlocked } from "@/lib/admin/blocked";
import { unblockAction } from "@/app/admin/actions";
import { AdminNotice } from "@/app/admin/notice";
import { buttonVariants } from "@/components/ui/button-variants";
import { formatDate } from "@/lib/format/date";
import Link from "next/link";

export default async function BlockedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const query = await searchParams;
  const [items, bySource] = await Promise.all([listBlocked(), blockedBySource()]);
  return (
    <>
      <AdminNotice query={query} />
      <h1 className="text-xl">Заблокировано</h1>
      <p className="mt-2">
        Жёсткие флаги (предоплата, карты, сим-карты, клады) сюда попадают сразу и в очередь одобрения не идут. Разбирать
        по одному не нужно: они не публикуются никогда. Раздел нужен, чтобы пополнять чёрный список и видеть, из каких
        источников это лезет.
      </p>
      <h2 className="mt-4 text-lg">Откуда лезет</h2>
      <ul>
        {bySource.map((row) => (
          <li key={row.label}>
            {row.label}: {row.count}
          </li>
        ))}
        {bySource.length === 0 ? <li>Пока пусто.</li> : null}
      </ul>
      {items.map((item) => (
        <article key={item.id} className="mt-6 border-t border-border pt-4">
          <h3>{item.title}</h3>
          <p className="admin-kicker">
            {item.cityName} · {item.sourceName || item.sourceLabel} · {item.reason} · {formatDate(item.createdAt)}
          </p>
          <p>
            {item.contactPhone || item.contactTelegram || "контакта нет"}
          </p>
          <pre className="admin-pre">{item.rawText}</pre>
          <form action={unblockAction} className="mt-2">
            <input type="hidden" name="id" value={item.id} />
            <button type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Это ошибка, вернуть в очередь
            </button>
          </form>
          {item.source === "EMPLOYER" ? (
            <p className="mt-2">
              <Link href={`/admin/employers/queue?id=${item.id}`}>Открыть в очереди кабинета</Link>
            </p>
          ) : null}
        </article>
      ))}
    </>
  );
}
