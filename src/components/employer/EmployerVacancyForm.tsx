import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { FIELD_CLASS } from "@/lib/auth/constants";
import { citySelectOptions } from "@/lib/auth/schemas";
import { getAllCities, getDistricts, publishOnlyActiveMessage } from "@/lib/geo";
import { listProfessionCatalog, listSpheres } from "@/lib/professions";
import { saveVacancyAction } from "@/app/employer/actions";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/format/cn";
import type { EmployerVacancyInput } from "@/lib/auth/schemas";
import type { CabinetVacancyStatus } from "@/lib/policy/status";

export function EmployerVacancyForm({
  id,
  values,
  status,
}: {
  id?: string;
  values: EmployerVacancyInput;
  status?: CabinetVacancyStatus;
}) {
  const cities = citySelectOptions();
  const spheres = listSpheres();
  const professions = listProfessionCatalog();
  const districts = getAllCities().map((city) => ({
    city: city.name.nom,
    items: getDistricts(city.slug),
  }));

  return (
    <form action={saveVacancyAction} className="flex min-w-0 flex-col gap-4">
      {id ? <input type="hidden" name="id" value={id} /> : null}
      {status ? (
        <Alert tone={status.listed ? "success" : status.label === "На проверке" ? "info" : "warning"}>
          <p>{status.label}</p>
          {status.hint ? <p className="mt-1">{status.hint}</p> : null}
        </Alert>
      ) : null}
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor="vac-title">Название</Label>
        <input id="vac-title" name="title" required defaultValue={values.title} className={FIELD_CLASS} />
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor="vac-description">Описание</Label>
        <textarea
          id="vac-description"
          name="description"
          required
          rows={8}
          maxLength={3000}
          defaultValue={values.description}
          className={FIELD_CLASS}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor="vac-city">Город</Label>
        <select id="vac-city" name="citySlug" required defaultValue={values.citySlug} className={FIELD_CLASS}>
          {cities.map((city) => (
            <option key={city.slug} value={city.slug}>
              {city.label}
            </option>
          ))}
        </select>
        <p className="text-sm text-muted">{publishOnlyActiveMessage()}</p>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor="vac-district">Район</Label>
        <select id="vac-district" name="districtSlug" defaultValue={values.districtSlug} className={FIELD_CLASS}>
          <option value="">—</option>
          {districts.map((group) =>
            group.items.length ? (
              <optgroup key={group.city} label={group.city}>
                {group.items.map((district) => (
                  <option key={district.slug} value={district.slug}>
                    {district.name}
                  </option>
                ))}
              </optgroup>
            ) : null,
          )}
        </select>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor="vac-address">Адрес</Label>
        <input id="vac-address" name="address" defaultValue={values.address} className={FIELD_CLASS} />
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor="vac-sphere">Сфера</Label>
        <select id="vac-sphere" name="sphere" required defaultValue={values.sphere} className={FIELD_CLASS}>
          {spheres.map((sphere) => (
            <option key={sphere.slug} value={sphere.slug}>
              {sphere.name}
            </option>
          ))}
          <option value="unknown">другое</option>
        </select>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor="vac-profession">Профессия</Label>
        <select
          id="vac-profession"
          name="professionSlug"
          defaultValue={values.professionSlug}
          className={FIELD_CLASS}
        >
          <option value="">—</option>
          {professions.map((item) => (
            <option key={item.slug} value={item.slug}>
              {item.name}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="flex min-w-0 flex-col gap-3">
        <legend className="text-sm font-medium">Зарплата</legend>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="vac-salary-from">От, ₽</Label>
          <input
            id="vac-salary-from"
            name="salaryFrom"
            type="number"
            min={0}
            defaultValue={values.salaryFrom ?? ""}
            className={FIELD_CLASS}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="vac-salary-to">До, ₽</Label>
          <input
            id="vac-salary-to"
            name="salaryTo"
            type="number"
            min={0}
            defaultValue={values.salaryTo ?? ""}
            className={FIELD_CLASS}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="vac-salary-period">За период</Label>
          <select
            id="vac-salary-period"
            name="salaryPeriod"
            defaultValue={values.salaryPeriod}
            className={FIELD_CLASS}
          >
            <option value="MONTH">в месяц</option>
            <option value="SHIFT">за смену</option>
            <option value="HOUR">в час</option>
            <option value="PIECE">за единицу</option>
          </select>
        </div>
      </fieldset>

      <fieldset className="flex min-w-0 flex-col gap-3">
        <legend className="text-sm font-medium">Формат работы</legend>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="vac-format">Формат</Label>
          <select id="vac-format" name="workFormat" defaultValue={values.workFormat} className={FIELD_CLASS}>
            <option value="LOCAL">местная работа</option>
            <option value="VAHTA">вахта</option>
            <option value="REMOTE">удалённо</option>
          </select>
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="vac-work-location">Место работы (для вахты)</Label>
          <input
            id="vac-work-location"
            name="workLocationText"
            defaultValue={values.workLocationText}
            className={FIELD_CLASS}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="vac-rotation">Схема смен (для вахты)</Label>
          <input
            id="vac-rotation"
            name="rotationPattern"
            defaultValue={values.rotationPattern}
            placeholder="60/30"
            className={FIELD_CLASS}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="vac-vahta-days">Дней вахты</Label>
          <input
            id="vac-vahta-days"
            name="vahtaDays"
            type="number"
            min={0}
            defaultValue={values.vahtaDays ?? ""}
            className={FIELD_CLASS}
          />
        </div>
        <label className="flex min-h-tap items-center gap-2">
          <input type="checkbox" name="housingProvided" defaultChecked={values.housingProvided} /> жильё
        </label>
        <label className="flex min-h-tap items-center gap-2">
          <input type="checkbox" name="mealsProvided" defaultChecked={values.mealsProvided} /> питание
        </label>
        <label className="flex min-h-tap items-center gap-2">
          <input type="checkbox" name="travelPaid" defaultChecked={values.travelPaid} /> проезд
        </label>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="vac-schedule">График (для местной работы)</Label>
          <input id="vac-schedule" name="schedule" defaultValue={values.schedule} className={FIELD_CLASS} />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="vac-experience">Опыт</Label>
          <select
            id="vac-experience"
            name="experience"
            defaultValue={values.experience}
            className={FIELD_CLASS}
          >
            <option value="">не указан</option>
            <option value="NONE">без опыта</option>
            <option value="UP_TO_1">до 1 года</option>
            <option value="FROM_1_TO_3">1–3 года</option>
            <option value="FROM_3">от 3 лет</option>
          </select>
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="vac-employment">Занятость</Label>
          <select
            id="vac-employment"
            name="employmentType"
            defaultValue={values.employmentType}
            className={FIELD_CLASS}
          >
            <option value="">не указана</option>
            <option value="FULL">полная</option>
            <option value="PART">частичная</option>
            <option value="SHIFT">сменная</option>
            <option value="TEMPORARY">временная</option>
            <option value="REMOTE">удалённо</option>
          </select>
        </div>
      </fieldset>

      <fieldset className="flex min-w-0 flex-col gap-3">
        <legend className="text-sm font-medium">Контакты</legend>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="vac-phone">Телефон</Label>
          <input id="vac-phone" name="contactPhone" defaultValue={values.contactPhone} className={FIELD_CLASS} />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="vac-telegram">Telegram</Label>
          <input
            id="vac-telegram"
            name="contactTelegram"
            defaultValue={values.contactTelegram}
            className={FIELD_CLASS}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="vac-email">Почта</Label>
          <input
            id="vac-email"
            name="contactEmail"
            type="email"
            defaultValue={values.contactEmail}
            className={FIELD_CLASS}
          />
        </div>
      </fieldset>

      <button type="submit" className={cn(buttonVariants({ variant: "primary" }), "self-start")}>
        {id ? "Сохранить вакансию" : "Сохранить"}
      </button>
    </form>
  );
}
