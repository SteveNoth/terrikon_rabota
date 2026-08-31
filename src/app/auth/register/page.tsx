import { AuthNotice } from "@/components/auth/AuthNotice";
import { Label } from "@/components/ui/label";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/format/cn";
import { FIELD_CLASS } from "@/lib/auth/constants";
import { citySelectOptions } from "@/lib/auth/schemas";
import { firstQuery, safeNextPath } from "@/lib/auth/next-path";
import { getDefaultCity } from "@/lib/geo";
import { registerAction } from "@/app/auth/actions";
import { getUser } from "@/lib/adapters/auth";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Регистрация | Террикон Работа",
  description: "Создать аккаунт соискателя или работодателя.",
  robots: { index: false, follow: false },
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getUser();
  const query = await searchParams;
  const next = safeNextPath(firstQuery(query.next), "/");
  if (user) {
    redirect(user.role === "EMPLOYER" ? "/employer/dashboard" : next);
  }

  const role = firstQuery(query.role) === "employer" ? "EMPLOYER" : firstQuery(query.role) === "seeker" ? "SEEKER" : "";
  const email = firstQuery(query.email) ?? "";
  const cities = citySelectOptions();
  const defaultCity = getDefaultCity().slug;

  return (
    <>
      <h1 className="font-display text-2xl font-medium">Регистрация</h1>
      <p className="text-md text-muted">
        Смотреть вакансии можно без аккаунта. Регистрация нужна, чтобы откликаться или размещать объявления.
      </p>
      <AuthNotice query={query} />
      <form action={registerAction} className="flex min-w-0 flex-col gap-4">
        <input type="hidden" name="next" value={next} />
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="reg-name">Имя</Label>
          <input id="reg-name" name="name" required autoComplete="name" className={FIELD_CLASS} />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="reg-email">Email</Label>
          <input
            id="reg-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            defaultValue={email}
            className={FIELD_CLASS}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="reg-password">Пароль</Label>
          <input
            id="reg-password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className={FIELD_CLASS}
          />
          <p className="text-sm text-muted">Не короче 8 символов.</p>
        </div>
        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="text-sm font-medium">Кто вы</legend>
          <label className="flex min-h-tap items-center gap-2">
            <input type="radio" name="role" value="SEEKER" required defaultChecked={role !== "EMPLOYER"} />
            Ищу работу
          </label>
          <label className="flex min-h-tap items-center gap-2">
            <input type="radio" name="role" value="EMPLOYER" defaultChecked={role === "EMPLOYER"} />
            Я работодатель
          </label>
        </fieldset>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="reg-city">Город</Label>
          <select id="reg-city" name="citySlug" required defaultValue={defaultCity} className={FIELD_CLASS}>
            {cities.map((city) => (
              <option key={city.slug} value={city.slug}>
                {city.label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={cn(buttonVariants({ variant: "primary" }), "self-start")}>
          Создать аккаунт
        </button>
      </form>
      <p className="text-sm text-muted">
        Уже есть аккаунт?{" "}
        <Link href={`/auth/login?next=${encodeURIComponent(next)}`} className="text-brand underline-offset-2 hover:underline">
          Войти
        </Link>
      </p>
    </>
  );
}
