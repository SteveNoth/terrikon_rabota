import { PhoneLink } from "@/components/vacancy/PhoneLink";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/format/cn";
import type { VacancyView } from "@/lib/vacancy/view";

export function VacancyContacts({
  phone,
  telegramHref,
  telegramLabel,
  emailHref,
  emailLabel,
}: Pick<VacancyView, "phone" | "telegramHref" | "telegramLabel" | "emailHref" | "emailLabel">) {
  if (!phone && !telegramHref && !emailHref) {
    return null;
  }

  return (
    <section className="flex min-w-0 flex-col gap-3" aria-labelledby="vacancy-contacts">
      <h2 id="vacancy-contacts" className="font-display text-xl font-medium">
        Контакты
      </h2>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap">
        {phone ? <PhoneLink phone={phone} /> : null}
        {telegramHref && telegramLabel ? (
          <a
            href={telegramHref}
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "outline" }), "min-w-0 justify-start")}
          >
            Telegram {telegramLabel}
          </a>
        ) : null}
        {emailHref && emailLabel ? (
          <a
            href={emailHref}
            className={cn(buttonVariants({ variant: "outline" }), "min-w-0 justify-start break-all")}
          >
            {emailLabel}
          </a>
        ) : null}
      </div>
    </section>
  );
}
