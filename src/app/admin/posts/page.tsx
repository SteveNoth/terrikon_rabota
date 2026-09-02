import { requireAdmin } from "@/lib/admin/auth";
import { listPendingPosts } from "@/lib/admin/posts";
import { AdminNotice } from "@/app/admin/notice";
import { PostsHotkeys } from "@/app/admin/hotkeys";
import { postApproveAction, postRejectAction, postRejectStopAction } from "@/app/admin/actions";
import { buttonVariants } from "@/components/ui/button-variants";
import { SOURCE_LABEL } from "@/lib/format/source";
import { listSpheres } from "@/lib/professions";
import { formatDate } from "@/lib/format/date";

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const query = await searchParams;
  const posts = await listPendingPosts();
  const current = posts[0] ?? null;
  const spheres = listSpheres();
  return (
    <>
      <PostsHotkeys />
      <AdminNotice query={query} />
      <h1 className="text-xl">Модерация постов</h1>
      <p className="mt-2">
        Посты, которые фильтр пометил «возможно вакансия». Горячие клавиши: Y — это вакансия, N — нет, S — стоп-слово.
      </p>
      <p className="admin-kicker">В очереди {posts.length}</p>
      {current ? (
        <article className="mt-4">
          <p className="admin-kicker">
            {SOURCE_LABEL[current.source]} · баллы {current.filterScore} · {formatDate(current.createdAt)}
            {current.sourceUrl ? (
              <>
                {" "}
                · <a href={current.sourceUrl}>оригинал</a>
              </>
            ) : null}
          </p>
          <pre className="admin-pre">{current.rawText}</pre>
          <p className="mt-2">Правила: {current.reasons.join(", ") || "—"}</p>
          <form id="post-approve-form" action={postApproveAction} className="mt-3">
            <input type="hidden" name="id" value={current.id} />
            <label className="admin-field">
              Добавить профессию в словарь
              <input name="professionName" placeholder="не обязательно" />
            </label>
            <label className="admin-field">
              Сфера профессии
              <select name="sphere" defaultValue={spheres[0]?.slug ?? "uslugi"}>
                {spheres.map((sphere) => (
                  <option key={sphere.slug} value={sphere.slug}>
                    {sphere.name}
                  </option>
                ))}
              </select>
            </label>
          </form>
          <div className="admin-actions">
            <button
              id="post-approve"
              form="post-approve-form"
              type="submit"
              className={buttonVariants({ variant: "primary", size: "sm" })}
            >
              Это вакансия (Y)
            </button>
            <form action={postRejectAction}>
              <input type="hidden" name="id" value={current.id} />
              <button id="post-reject" type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>
                Не вакансия (N)
              </button>
            </form>
            <form action={postRejectStopAction}>
              <input type="hidden" name="id" value={current.id} />
              <label className="admin-field mb-0">
                Стоп-слово
                <input id="post-stop-word" name="stopWord" required />
              </label>
              <button id="post-stop" type="submit" className={buttonVariants({ variant: "danger", size: "sm" })}>
                Не вакансия + стоп-слово (S)
              </button>
            </form>
          </div>
        </article>
      ) : (
        <p className="mt-4">Очередь постов пуста.</p>
      )}
      {posts.length > 1 ? (
        <ol className="mt-6">
          {posts.slice(1, 20).map((post) => (
            <li key={post.id}>
              {SOURCE_LABEL[post.source]} · {post.filterScore} · {post.rawText.slice(0, 80)}
            </li>
          ))}
        </ol>
      ) : null}
    </>
  );
}
