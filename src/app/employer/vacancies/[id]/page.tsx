import { AuthNotice } from "@/components/auth/AuthNotice";
import { EmployerVacancyForm } from "@/components/employer/EmployerVacancyForm";
import { getUser } from "@/lib/adapters/auth";
import { FOREIGN_VACANCY_MESSAGE } from "@/lib/auth/constants";
import { getOwnVacancy, vacancyToFormValues } from "@/lib/repo/employer";
import { cabinetVacancyStatus } from "@/lib/policy";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "Редактирование вакансии | Террикон Работа",
  robots: { index: false, follow: false },
};

export default async function EditVacancyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getUser();
  if (!user?.employerId) {
    notFound();
  }
  const { id } = await params;
  const found = await getOwnVacancy(user.employerId, id);
  if (!found.ok) {
    if (found.error === FOREIGN_VACANCY_MESSAGE) {
      return (
        <>
          <h1 className="font-display text-2xl font-medium">Нет доступа</h1>
          <p className="text-md text-muted">{FOREIGN_VACANCY_MESSAGE}</p>
          <p>
            <Link href="/employer/dashboard" className="text-brand underline-offset-2 hover:underline">
              К кабинету
            </Link>
          </p>
        </>
      );
    }
    notFound();
  }
  const query = await searchParams;

  return (
    <>
      <p>
        <Link href="/employer/dashboard" className="text-brand underline-offset-2 hover:underline">
          ← К кабинету
        </Link>
      </p>
      <h1 className="font-display text-2xl font-medium">Редактирование вакансии</h1>
      <AuthNotice query={query} />
      <EmployerVacancyForm
        id={found.vacancy.id}
        values={vacancyToFormValues(found.vacancy)}
        status={cabinetVacancyStatus(found.vacancy)}
      />
    </>
  );
}
