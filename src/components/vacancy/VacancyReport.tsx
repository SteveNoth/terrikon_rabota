import { Alert } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/format/cn";
import { REPORT_REASONS } from "@/lib/vacancy/reports";
import Link from "next/link";

export function VacancyReport({
  vacancyId,
  citySlug,
  slug,
  status,
}: {
  vacancyId: string;
  citySlug: string;
  slug: string;
  status?: "ok" | "error";
}) {
  return (
    <section id="report" className="flex min-w-0 flex-col gap-3">
      <h2 className="font-display text-xl font-medium">Пожаловаться</h2>
      {status === "ok" ? (
        <Alert tone="success">Жалоба отправлена. Мы посмотрим объявление.</Alert>
      ) : null}
      {status === "error" ? (
        <Alert tone="danger">Не удалось отправить жалобу. Проверьте причину и попробуйте ещё раз.</Alert>
      ) : null}
      <form action="/api/reports" method="POST" className="flex min-w-0 flex-col gap-4">
        <input type="hidden" name="vacancyId" value={vacancyId} />
        <input type="hidden" name="city" value={citySlug} />
        <input type="hidden" name="slug" value={slug} />
        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="text-sm font-medium">Причина</legend>
          {REPORT_REASONS.map((reason) => (
            <label key={reason.id} className="flex min-h-tap min-w-0 items-center gap-2 text-md">
              <input
                type="radio"
                name="reason"
                value={reason.id}
                required
                className="size-4 shrink-0 accent-brand"
              />
              <span className="min-w-0 break-words">{reason.label}</span>
            </label>
          ))}
        </fieldset>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="report-comment" tone="muted">
            Комментарий (необязательно)
          </Label>
          <textarea
            id="report-comment"
            name="comment"
            rows={3}
            maxLength={2000}
            className="block w-full min-h-tap rounded-md border border-border bg-surface px-3 py-2 text-md text-text placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          />
        </div>
        <button type="submit" className={cn(buttonVariants({ variant: "outline" }), "self-start")}>
          Отправить жалобу
        </button>
      </form>
      <p className="text-sm text-muted">
        Если сомневаетесь — сначала прочитайте{" "}
        <Link href="/safety" className="text-brand underline-offset-2 hover:underline">
          Как не попасться при поиске работы
        </Link>
        .
      </p>
    </section>
  );
}
