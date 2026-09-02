import { Label } from "@/components/ui/label";
import { FIELD_CLASS } from "@/lib/auth/constants";
import { citySelectOptions } from "@/lib/auth/schemas";
import { listSpheres } from "@/lib/professions";
import { saveProfileAction } from "@/app/employer/actions";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/format/cn";
import type { EmployerCompany } from "@/lib/repo/employer";

export function CompanyProfileForm({ company }: { company: EmployerCompany }) {
  const cities = citySelectOptions();
  const spheres = listSpheres();

  return (
    <form action={saveProfileAction} className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor="company-name">Название компании</Label>
        <input id="company-name" name="name" required defaultValue={company.name} className={FIELD_CLASS} />
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor="company-description">Описание</Label>
        <textarea
          id="company-description"
          name="description"
          rows={4}
          maxLength={3000}
          defaultValue={company.description ?? ""}
          className={FIELD_CLASS}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor="company-city">Город</Label>
        <select id="company-city" name="citySlug" required defaultValue={company.citySlug} className={FIELD_CLASS}>
          {cities.map((city) => (
            <option key={city.slug} value={city.slug}>
              {city.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor="company-sphere">Сфера</Label>
        <select id="company-sphere" name="sphere" required defaultValue={company.sphere} className={FIELD_CLASS}>
          <option value="unknown">не указана</option>
          {spheres.map((sphere) => (
            <option key={sphere.slug} value={sphere.slug}>
              {sphere.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor="company-phone">Телефон</Label>
        <input id="company-phone" name="phone" defaultValue={company.phone ?? ""} className={FIELD_CLASS} />
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor="company-telegram">Telegram</Label>
        <input
          id="company-telegram"
          name="telegram"
          defaultValue={company.telegram ?? ""}
          placeholder="@username"
          className={FIELD_CLASS}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor="company-email">Почта для связи</Label>
        <input
          id="company-email"
          name="email"
          type="email"
          defaultValue={company.email ?? ""}
          className={FIELD_CLASS}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor="company-website">Сайт</Label>
        <input
          id="company-website"
          name="website"
          type="url"
          defaultValue={company.website ?? ""}
          placeholder="https://"
          className={FIELD_CLASS}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor="company-logo">Ссылка на логотип</Label>
        <input
          id="company-logo"
          name="logoUrl"
          type="url"
          defaultValue={company.logoUrl ?? ""}
          placeholder="https://"
          className={FIELD_CLASS}
        />
        <p className="text-sm text-muted">Файл мы не храним — только внешняя ссылка.</p>
      </div>
      <button type="submit" className={cn(buttonVariants({ variant: "primary" }), "self-start")}>
        Сохранить профиль
      </button>
    </form>
  );
}
