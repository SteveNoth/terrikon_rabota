import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/format/cn";
import type { CityOption, CitySlug, District, ExternalDestination } from "@/lib/geo";
import {
  EMPLOYMENT_OPTIONS,
  EXPERIENCE_OPTIONS,
  PUBLISHED_OPTIONS,
  ROTATION_OPTIONS,
  SCHEDULE_OPTIONS,
  SOURCE_OPTIONS,
  VAHTA_DAYS_OPTIONS,
} from "@/lib/jobs/options";
import type { JobsSection } from "@/lib/jobs/search-cookie";
import { jobsHref, jobsPath } from "@/lib/jobs/url";
import type { Profession, Sphere } from "@/lib/professions";
import type { ParsedVacancyQuery } from "@/lib/validation/vacancy-query";
import type { ReactNode } from "react";

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

export function JobsFilters({
  citySlug,
  section,
  query,
  open,
  activeCities,
  soonCities,
  districts,
  spheres,
  professions,
  destinations,
}: {
  citySlug: CitySlug;
  section: JobsSection;
  query: ParsedVacancyQuery;
  open: boolean;
  activeCities: CityOption[];
  soonCities: CityOption[];
  districts: District[];
  spheres: Sphere[];
  professions: Profession[];
  destinations: ExternalDestination[];
}) {
  const closeHref = jobsHref(citySlug, section, query, { filters: false });
  const resetHref = `${jobsPath(citySlug, section)}?reset=1`;
  const professionsBySphere = new Map<string, Profession[]>();
  for (const sphere of spheres) {
    professionsBySphere.set(sphere.slug, []);
  }
  for (const profession of professions) {
    const list = professionsBySphere.get(profession.sphere) ?? [];
    list.push(profession);
    professionsBySphere.set(profession.sphere, list);
  }

  return (
    <form
      method="GET"
      action={jobsPath(citySlug, section)}
      className={cn(
        "flex min-w-0 flex-col gap-4 border-border bg-surface",
        open
          ? "fixed inset-0 z-30 overflow-y-auto p-4 pb-bottomnav-plus md:static md:z-0 md:w-72 md:shrink-0 md:overflow-visible md:border-0 md:p-0 md:pb-0"
          : "hidden md:flex md:w-72 md:shrink-0",
      )}
    >
      <div className="flex items-center justify-between gap-3 md:hidden">
        <p className="font-display text-lg font-medium">Фильтры</p>
        <a href={closeHref} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
          Закрыть
        </a>
      </div>

      <p className="hidden text-sm text-muted md:block">
        Условия попадают в адрес. Ссылку можно отправить — человек увидит то же самое.
      </p>

      <Field id="jobs-q" label="Поиск">
        <Input
          id="jobs-q"
          type="search"
          name="q"
          defaultValue={query.q ?? ""}
          placeholder="Должность или слово"
          autoComplete="off"
        />
      </Field>

      <Field id="jobs-city" label="Город">
        <Select id="jobs-city" name="city" defaultValue={citySlug} autoComplete="off">
          {activeCities.map((city) => (
            <option key={city.slug} value={city.slug}>
              {city.name}
            </option>
          ))}
          {soonCities.length > 0 ? (
            <optgroup label="Скоро">
              {soonCities.map((city) => (
                <option key={city.slug} value={city.slug}>
                  {city.name} · скоро
                </option>
              ))}
            </optgroup>
          ) : null}
        </Select>
      </Field>

      {section === "jobs" && districts.length > 0 ? (
        <Field id="jobs-district" label="Район">
          <Select id="jobs-district" name="district" defaultValue={query.district ?? ""} autoComplete="off">
            <option value="">Любой</option>
            {districts.map((district) => (
              <option key={district.slug} value={district.slug}>
                {district.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <Field id="jobs-sphere" label="Сфера">
        <Select id="jobs-sphere" name="sphere" defaultValue={query.sphere ?? ""} autoComplete="off">
          <option value="">Все сферы</option>
          {spheres.map((sphere) => (
            <option key={sphere.slug} value={sphere.slug}>
              {sphere.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field id="jobs-profession" label="Профессия">
        <Select
          id="jobs-profession"
          name="profession"
          defaultValue={query.profession ?? ""}
          autoComplete="off"
        >
          <option value="">Все профессии</option>
          {spheres.map((sphere) => {
            const items = professionsBySphere.get(sphere.slug) ?? [];
            if (items.length === 0) {
              return null;
            }
            return (
              <optgroup key={sphere.slug} label={sphere.name}>
                {items.map((profession) => (
                  <option key={profession.slug} value={profession.slug}>
                    {profession.name}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </Select>
      </Field>

      <Field id="jobs-salary" label="Зарплата от, ₽">
        <Input
          id="jobs-salary"
          type="number"
          name="salaryFrom"
          min={0}
          step={1000}
          inputMode="numeric"
          defaultValue={query.salaryFrom ?? ""}
          placeholder="40000"
        />
      </Field>

      {section === "jobs" ? (
        <Field id="jobs-schedule" label="График">
          <Select id="jobs-schedule" name="schedule" defaultValue={query.schedule ?? ""} autoComplete="off">
            <option value="">Любой</option>
            {SCHEDULE_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <Field id="jobs-experience" label="Опыт">
        <Select
          id="jobs-experience"
          name="experience"
          defaultValue={query.experience ?? ""}
          autoComplete="off"
        >
          <option value="">Неважно</option>
          {EXPERIENCE_OPTIONS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field id="jobs-employment" label="Тип занятости">
        <Select
          id="jobs-employment"
          name="employmentType"
          defaultValue={query.employmentType ?? ""}
          autoComplete="off"
        >
          <option value="">Любой</option>
          {EMPLOYMENT_OPTIONS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field id="jobs-published" label="Дата публикации">
        <Select
          id="jobs-published"
          name="published"
          defaultValue={query.publishedDays ? String(query.publishedDays) : ""}
          autoComplete="off"
        >
          <option value="">За всё время</option>
          {PUBLISHED_OPTIONS.map((item) => (
            <option key={item.value} value={String(item.value)}>
              {item.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field id="jobs-source" label="Источник">
        <Select id="jobs-source" name="source" defaultValue={query.source ?? ""} autoComplete="off">
          <option value="">Все источники</option>
          {SOURCE_OPTIONS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </Select>
      </Field>

      {section === "vahta" ? (
        <>
          <Field id="jobs-destination" label="Место работы">
            <Select
              id="jobs-destination"
              name="destination"
              defaultValue={query.destination ?? ""}
              autoComplete="off"
            >
              <option value="">Любое направление</option>
              {destinations.map((item) => (
                <option key={item.slug} value={item.slug}>
                  {item.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field id="jobs-vahta-days" label="Длительность смены">
            <Select
              id="jobs-vahta-days"
              name="vahtaDays"
              defaultValue={query.vahtaDays ? String(query.vahtaDays) : ""}
              autoComplete="off"
            >
              <option value="">Любая</option>
              {VAHTA_DAYS_OPTIONS.map((item) => (
                <option key={item.value} value={String(item.value)}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field id="jobs-rotation" label="Схема ротации">
            <Select
              id="jobs-rotation"
              name="rotation"
              defaultValue={query.rotation ?? ""}
              autoComplete="off"
            >
              <option value="">Любая</option>
              {ROTATION_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
        </>
      ) : null}

      <div className="flex min-w-0 flex-col gap-2">
        <Checkbox id="jobs-has-salary" name="hasSalary" value="1" defaultChecked={query.hasSalary} label="Только с указанной зарплатой" />
        <Checkbox
          id="jobs-verified"
          name="verified"
          value="1"
          defaultChecked={query.verifiedOnly}
          label="Только проверенные работодатели"
        />
        {section === "vahta" ? (
          <>
            <Checkbox id="jobs-housing" name="housing" value="1" defaultChecked={query.housing} label="Проживание" />
            <Checkbox id="jobs-meals" name="meals" value="1" defaultChecked={query.meals} label="Питание" />
            <Checkbox id="jobs-travel" name="travel" value="1" defaultChecked={query.travel} label="Проезд" />
            <Checkbox
              id="jobs-direct"
              name="direct"
              value="1"
              defaultChecked={query.direct}
              label="Напрямую от работодателя"
            />
          </>
        ) : null}
      </div>

      {query.sort !== "date" ? <input type="hidden" name="sort" value={query.sort} /> : null}

      <div className="flex min-w-0 flex-col gap-2">
        <Button type="submit" variant="primary" full>
          Показать вакансии
        </Button>
        <a href={resetHref} className={cn(buttonVariants({ variant: "ghost", full: true }))}>
          Сбросить фильтры
        </a>
      </div>
    </form>
  );
}
