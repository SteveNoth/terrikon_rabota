import { requireAdmin } from "@/lib/admin/auth";
import { publishOnlyActiveMessage } from "@/lib/admin/vacancies";
import { VacancyAdminForm } from "@/app/admin/vacancies/form";
import { AdminNotice } from "@/app/admin/notice";
import { getDefaultCity } from "@/lib/geo";

export default async function NewVacancyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const query = await searchParams;
  const city = getDefaultCity();
  return (
    <>
      <AdminNotice query={query} />
      <h1 className="text-xl">Новая вакансия</h1>
      <p className="admin-kicker">{publishOnlyActiveMessage()}</p>
      <VacancyAdminForm
        values={{
          title: "",
          titleOriginal: "",
          rawText: "",
          description: "",
          summaryLine: "",
          citySlug: city.slug,
          districtSlug: "",
          address: "",
          sphere: "unknown",
          professionSlug: "",
          source: "MANUAL",
          sourceName: "",
          sourceUrl: "",
          externalId: "",
          salaryFrom: null,
          salaryTo: null,
          salaryText: "",
          salaryPeriod: "MONTH",
          salaryIsGross: null,
          employerInn: "",
          workFormat: "LOCAL",
          workLocationText: "",
          workCitySlug: "",
          rotationPattern: "",
          vahtaDays: null,
          housingProvided: false,
          mealsProvided: false,
          travelPaid: false,
          advancePayment: false,
          employerKind: "UNKNOWN",
          schedule: "",
          hoursPerDay: null,
          experience: null,
          employmentType: null,
          contactPhone: "",
          contactTelegram: "",
          contactEmail: "",
          completeness: 40,
          moderationStatus: "APPROVED",
          isActive: true,
          needsHumanReview: false,
          sections: { description: "", tasks: [], requirements: [], conditions: [] },
        }}
      />
    </>
  );
}
