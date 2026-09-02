import { AuthNotice } from "@/components/auth/AuthNotice";
import { EmployerVacancyForm } from "@/components/employer/EmployerVacancyForm";
import { getUser } from "@/lib/adapters/auth";
import { getEmployerCompany } from "@/lib/repo/employer";
import { getDefaultCity, isActiveCity } from "@/lib/geo";
import { listSpheres } from "@/lib/professions";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "Новая вакансия | Террикон Работа",
  robots: { index: false, follow: false },
};

export default async function NewVacancyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getUser();
  if (!user?.employerId) {
    notFound();
  }
  const company = await getEmployerCompany(user.employerId);
  if (!company) {
    notFound();
  }
  const citySlug = isActiveCity(company.citySlug) ? company.citySlug : getDefaultCity().slug;
  const sphere = listSpheres()[0]?.slug ?? "unknown";
  const query = await searchParams;

  return (
    <>
      <p>
        <Link href="/employer/dashboard" className="text-brand underline-offset-2 hover:underline">
          ← К кабинету
        </Link>
      </p>
      <h1 className="font-display text-2xl font-medium">Новая вакансия</h1>
      <AuthNotice query={query} />
      <EmployerVacancyForm
        values={{
          title: "",
          description: "",
          citySlug,
          districtSlug: "",
          address: "",
          sphere: company.sphere !== "unknown" ? company.sphere : sphere,
          professionSlug: "",
          salaryFrom: null,
          salaryTo: null,
          salaryPeriod: "MONTH",
          workFormat: "LOCAL",
          workLocationText: "",
          rotationPattern: "",
          vahtaDays: null,
          housingProvided: false,
          mealsProvided: false,
          travelPaid: false,
          schedule: "",
          experience: "",
          employmentType: "",
          contactPhone: company.phone ?? "",
          contactTelegram: company.telegram ?? "",
          contactEmail: company.email ?? user.email,
        }}
      />
    </>
  );
}
