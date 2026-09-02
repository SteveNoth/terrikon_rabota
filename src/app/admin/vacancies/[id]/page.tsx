import { requireAdmin } from "@/lib/admin/auth";
import { getAdminVacancy, publishOnlyActiveMessage } from "@/lib/admin/vacancies";
import { VacancyAdminForm } from "@/app/admin/vacancies/form";
import { AdminNotice } from "@/app/admin/notice";
import { notFound } from "next/navigation";
import { parseSections } from "@/lib/admin/sections";

export default async function EditVacancyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const { id } = await params;
  const query = await searchParams;
  const row = await getAdminVacancy(id);
  if (!row) {
    notFound();
  }
  return (
    <>
      <AdminNotice query={query} />
      <h1 className="text-xl">Редактирование</h1>
      <p className="admin-kicker">{publishOnlyActiveMessage()}</p>
      {row.source === "TRUDVSEM" ? (
        <p className="mt-2">
          ЦЗН: ИНН {row.employerInn || "не указан"}, зарплата {row.salaryIsGross ? "до вычета налога" : "признак не задан"}.
          Поле «до вычета» нельзя стереть молча — оно в форме.
        </p>
      ) : null}
      <VacancyAdminForm
        id={row.id}
        values={{
          title: row.title,
          titleOriginal: row.titleOriginal ?? "",
          rawText: row.rawText ?? "",
          description: row.description,
          summaryLine: row.summaryLine ?? "",
          citySlug: row.citySlug,
          districtSlug: row.districtSlug ?? "",
          address: row.address ?? "",
          sphere: row.sphere,
          professionSlug: row.professionSlug ?? "",
          source: row.source,
          sourceName: row.sourceName ?? "",
          sourceUrl: row.sourceUrl ?? "",
          externalId: row.externalId,
          salaryFrom: row.salaryFrom,
          salaryTo: row.salaryTo,
          salaryText: row.salaryText ?? "",
          salaryPeriod: row.salaryPeriod,
          salaryIsGross: row.salaryIsGross,
          employerInn: row.employerInn ?? "",
          workFormat: row.workFormat,
          workLocationText: row.workLocationText ?? "",
          workCitySlug: row.workCitySlug ?? "",
          rotationPattern: row.rotationPattern ?? "",
          vahtaDays: row.vahtaDays,
          housingProvided: row.housingProvided,
          mealsProvided: row.mealsProvided,
          travelPaid: row.travelPaid,
          advancePayment: row.advancePayment,
          employerKind: row.employerKind,
          schedule: row.schedule ?? "",
          hoursPerDay: row.hoursPerDay,
          experience: row.experience,
          employmentType: row.employmentType,
          contactPhone: row.contactPhone ?? "",
          contactTelegram: row.contactTelegram ?? "",
          contactEmail: row.contactEmail ?? "",
          completeness: row.completeness,
          moderationStatus: row.moderationStatus,
          isActive: row.isActive,
          needsHumanReview: row.needsHumanReview,
          sections: parseSections(row.descriptionSections),
        }}
      />
    </>
  );
}
