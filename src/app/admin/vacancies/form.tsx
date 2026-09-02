import { saveVacancyAction } from "@/app/admin/actions";
import { buttonVariants } from "@/components/ui/button-variants";
import { SOURCE_OPTIONS } from "@/lib/admin/constants";
import type { DescriptionSections } from "@/lib/admin/sections";
import { getAllCities, getDistricts } from "@/lib/geo";
import { listProfessionCatalog, listSpheres } from "@/lib/professions";
import { SOURCE_LABEL } from "@/lib/format/source";
import type {
  EmployerKind,
  EmploymentType,
  Experience,
  ModerationStatus,
  SalaryPeriod,
  Source,
  WorkFormat,
} from "@prisma/client";

export type VacancyFormValues = {
  title: string;
  titleOriginal: string;
  rawText: string;
  description: string;
  summaryLine: string;
  citySlug: string;
  districtSlug: string;
  address: string;
  sphere: string;
  professionSlug: string;
  source: Source;
  sourceName: string;
  sourceUrl: string;
  externalId: string;
  salaryFrom: number | null;
  salaryTo: number | null;
  salaryText: string;
  salaryPeriod: SalaryPeriod;
  salaryIsGross: boolean | null;
  employerInn: string;
  workFormat: WorkFormat;
  workLocationText: string;
  workCitySlug: string;
  rotationPattern: string;
  vahtaDays: number | null;
  housingProvided: boolean;
  mealsProvided: boolean;
  travelPaid: boolean;
  advancePayment: boolean;
  employerKind: EmployerKind;
  schedule: string;
  hoursPerDay: number | null;
  experience: Experience | null;
  employmentType: EmploymentType | null;
  contactPhone: string;
  contactTelegram: string;
  contactEmail: string;
  completeness: number;
  moderationStatus: ModerationStatus;
  isActive: boolean;
  needsHumanReview: boolean;
  sections: DescriptionSections;
};

export function VacancyAdminForm({ id, values }: { id?: string; values: VacancyFormValues }) {
  const cities = getAllCities();
  const districts = getDistricts(values.citySlug);
  const spheres = listSpheres();
  const professions = listProfessionCatalog();
  const grossValue = values.salaryIsGross === true ? "true" : values.salaryIsGross === false ? "false" : "unknown";

  return (
    <form action={saveVacancyAction} className="mt-4">
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <label className="admin-field">
        Название
        <input name="title" required defaultValue={values.title} />
      </label>
      <label className="admin-field">
        Оригинальный заголовок
        <input name="titleOriginal" defaultValue={values.titleOriginal} />
      </label>
      <label className="admin-field">
        Описание
        <textarea name="description" rows={8} defaultValue={values.description} />
      </label>
      <label className="admin-field">
        Сводка
        <input name="summaryLine" defaultValue={values.summaryLine} />
      </label>
      <label className="admin-field">
        Раздел «описание»
        <textarea name="sectionDescription" rows={3} defaultValue={values.sections.description} />
      </label>
      <label className="admin-field">
        Обязанности (по строке)
        <textarea name="sectionTasks" rows={4} defaultValue={values.sections.tasks.join("\n")} />
      </label>
      <label className="admin-field">
        Требования
        <textarea name="sectionRequirements" rows={4} defaultValue={values.sections.requirements.join("\n")} />
      </label>
      <label className="admin-field">
        Условия
        <textarea name="sectionConditions" rows={4} defaultValue={values.sections.conditions.join("\n")} />
      </label>

      <label className="admin-field">
        Город
        <select name="citySlug" defaultValue={values.citySlug} required>
          {cities.map((city) => (
            <option key={city.slug} value={city.slug}>
              {city.name.nom} ({city.status})
            </option>
          ))}
        </select>
      </label>
      <label className="admin-field">
        Район
        <select name="districtSlug" defaultValue={values.districtSlug}>
          <option value="">—</option>
          {districts.map((district) => (
            <option key={district.slug} value={district.slug}>
              {district.name}
            </option>
          ))}
        </select>
      </label>
      <label className="admin-field">
        Адрес
        <input name="address" defaultValue={values.address} />
      </label>
      <label className="admin-field">
        Сфера
        <select name="sphere" defaultValue={values.sphere}>
          {spheres.map((sphere) => (
            <option key={sphere.slug} value={sphere.slug}>
              {sphere.name}
            </option>
          ))}
          <option value="unknown">неизвестно</option>
        </select>
      </label>
      <label className="admin-field">
        Профессия
        <select name="professionSlug" defaultValue={values.professionSlug}>
          <option value="">—</option>
          {professions.map((item) => (
            <option key={item.slug} value={item.slug}>
              {item.name}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="mt-4">
        <legend>Зарплата</legend>
        <label className="admin-field">
          От
          <input type="number" name="salaryFrom" defaultValue={values.salaryFrom ?? ""} />
        </label>
        <label className="admin-field">
          До
          <input type="number" name="salaryTo" defaultValue={values.salaryTo ?? ""} />
        </label>
        <label className="admin-field">
          Как в источнике
          <input name="salaryText" defaultValue={values.salaryText} />
        </label>
        <label className="admin-field">
          Период
          <select name="salaryPeriod" defaultValue={values.salaryPeriod}>
            <option value="MONTH">месяц</option>
            <option value="SHIFT">смена</option>
            <option value="HOUR">час</option>
            <option value="PIECE">штука</option>
          </select>
        </label>
        <label className="admin-field">
          До вычета налога
          <select name="salaryIsGross" defaultValue={grossValue}>
            <option value="unknown">неизвестно</option>
            <option value="true">до вычета налога</option>
            <option value="false">на руки</option>
          </select>
        </label>
        <label className="admin-field">
          ИНН
          <input name="employerInn" defaultValue={values.employerInn} />
        </label>
      </fieldset>

      <fieldset className="mt-4">
        <legend>Формат работы</legend>
        <label className="admin-field">
          Формат
          <select name="workFormat" defaultValue={values.workFormat}>
            <option value="LOCAL">местная</option>
            <option value="VAHTA">вахта</option>
            <option value="REMOTE">удалённо</option>
          </select>
        </label>
        <label className="admin-field">
          Место работы
          <input name="workLocationText" defaultValue={values.workLocationText} />
        </label>
        <label className="admin-field">
          Город работы
          <input name="workCitySlug" defaultValue={values.workCitySlug} />
        </label>
        <label className="admin-field">
          Смена / ротация
          <input name="rotationPattern" defaultValue={values.rotationPattern} />
        </label>
        <label className="admin-field">
          Дней вахты
          <input type="number" name="vahtaDays" defaultValue={values.vahtaDays ?? ""} />
        </label>
        <label className="flex min-h-tap items-center gap-2">
          <input type="checkbox" name="housingProvided" defaultChecked={values.housingProvided} /> жильё
        </label>
        <label className="flex min-h-tap items-center gap-2">
          <input type="checkbox" name="mealsProvided" defaultChecked={values.mealsProvided} /> питание
        </label>
        <label className="flex min-h-tap items-center gap-2">
          <input type="checkbox" name="travelPaid" defaultChecked={values.travelPaid} /> проезд
        </label>
        <label className="flex min-h-tap items-center gap-2">
          <input type="checkbox" name="advancePayment" defaultChecked={values.advancePayment} /> аванс
        </label>
        <label className="admin-field">
          Кто набирает
          <select name="employerKind" defaultValue={values.employerKind}>
            <option value="UNKNOWN">неизвестно</option>
            <option value="DIRECT">напрямую</option>
            <option value="AGENCY">посредник</option>
          </select>
        </label>
        <label className="admin-field">
          График
          <input name="schedule" defaultValue={values.schedule} />
        </label>
        <label className="admin-field">
          Часов в день
          <input type="number" name="hoursPerDay" defaultValue={values.hoursPerDay ?? ""} />
        </label>
        <label className="admin-field">
          Опыт
          <select name="experience" defaultValue={values.experience ?? ""}>
            <option value="">—</option>
            <option value="NONE">без опыта</option>
            <option value="UP_TO_1">до 1 года</option>
            <option value="FROM_1_TO_3">1–3 года</option>
            <option value="FROM_3">от 3 лет</option>
          </select>
        </label>
        <label className="admin-field">
          Занятость
          <select name="employmentType" defaultValue={values.employmentType ?? ""}>
            <option value="">—</option>
            <option value="FULL">полная</option>
            <option value="PART">частичная</option>
            <option value="SHIFT">сменная</option>
            <option value="TEMPORARY">временная</option>
            <option value="REMOTE">удалённо</option>
          </select>
        </label>
      </fieldset>

      <fieldset className="mt-4">
        <legend>Контакты и источник</legend>
        <label className="admin-field">
          Телефон
          <input name="contactPhone" defaultValue={values.contactPhone} />
        </label>
        <label className="admin-field">
          Telegram
          <input name="contactTelegram" defaultValue={values.contactTelegram} />
        </label>
        <label className="admin-field">
          Почта
          <input name="contactEmail" defaultValue={values.contactEmail} />
        </label>
        <label className="admin-field">
          Источник
          <select name="source" defaultValue={values.source}>
            {SOURCE_OPTIONS.map((source) => (
              <option key={source} value={source}>
                {SOURCE_LABEL[source]}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-field">
          Имя источника
          <input name="sourceName" defaultValue={values.sourceName} />
        </label>
        <label className="admin-field">
          Ссылка
          <input name="sourceUrl" defaultValue={values.sourceUrl} />
        </label>
        {id ? <input type="hidden" name="externalId" value={values.externalId} /> : (
          <label className="admin-field">
            externalId
            <input name="externalId" defaultValue={values.externalId} />
          </label>
        )}
      </fieldset>

      <label className="admin-field">
        Полнота
        <input type="number" name="completeness" min={0} max={100} defaultValue={values.completeness} />
      </label>
      <label className="admin-field">
        Статус модерации
        <select name="moderationStatus" defaultValue={values.moderationStatus}>
          <option value="AUTO_OK">AUTO_OK</option>
          <option value="PENDING">PENDING</option>
          <option value="APPROVED">APPROVED</option>
          <option value="REJECTED">REJECTED</option>
          <option value="BLOCKED">BLOCKED</option>
        </select>
      </label>
      <label className="flex min-h-tap items-center gap-2">
        <input type="checkbox" name="isActive" defaultChecked={values.isActive} /> активна
      </label>
      <label className="flex min-h-tap items-center gap-2">
        <input type="checkbox" name="needsHumanReview" defaultChecked={values.needsHumanReview} /> нужна ручная проверка
      </label>

      {values.rawText ? (
        <details className="mt-4">
          <summary>Оригинал (не редактируется)</summary>
          <pre className="admin-pre">{values.rawText}</pre>
        </details>
      ) : (
        <label className="admin-field">
          Оригинал (запишется один раз)
          <textarea name="rawText" rows={4} defaultValue={values.rawText} />
        </label>
      )}

      <button type="submit" className={`${buttonVariants({ variant: "primary" })} mt-4`}>
        Сохранить
      </button>
    </form>
  );
}
