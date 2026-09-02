import { Alert } from "@/components/ui/alert";
import { ApplyForm } from "@/components/seeker/ApplyForm";
import { ProfileNav } from "@/components/seeker/ProfileNav";
import { AuthNotice } from "@/components/auth/AuthNotice";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/format/cn";
import { getUser } from "@/lib/adapters/auth";
import { APPLY_BLOCKED_MESSAGE, assertCanApply } from "@/lib/auth/blocks";
import { getApplicationForVacancy, getApplyVacancy, getSeekerProfile } from "@/lib/repo/seeker";
import { appliedAgoLabel } from "@/lib/seeker/labels";
import { VACANCY_CLOSED_LABEL } from "@/lib/seeker/constants";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "Отклик | Террикон Работа",
  robots: { index: false, follow: false },
};

export default async function ApplyPage({
  params,
  searchParams,
}: {
  params: Promise<{ vacancyId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getUser();
  if (!user) {
    notFound();
  }
  const { vacancyId } = await params;
  const query = await searchParams;
  const vacancy = await getApplyVacancy(vacancyId);
  if (!vacancy) {
    notFound();
  }

  const [allowed, existing, profile] = await Promise.all([
    assertCanApply(user.id),
    getApplicationForVacancy(user.id, vacancy.id),
    getSeekerProfile(user.id),
  ]);

  const resumeTemplate = [profile?.resumeText, profile?.resumeUrl].filter(Boolean).join("\n\n");

  return (
    <>
      <header className="flex min-w-0 flex-col gap-2">
        <h1 className="font-display text-2xl font-medium">Отклик</h1>
        <ProfileNav current="/profile/applications" />
      </header>
      <AuthNotice query={query} />
      <p className="text-md">
        Вакансия:{" "}
        <Link href={vacancy.href} className="text-brand underline-offset-2 hover:underline">
          {vacancy.title}
        </Link>
      </p>

      {!allowed.ok && !existing ? (
        <Alert tone="info">{allowed.error || APPLY_BLOCKED_MESSAGE}</Alert>
      ) : existing ? (
        <Alert tone="info">
          {appliedAgoLabel(existing.createdAt)}
          {vacancy.closed ? ` · ${VACANCY_CLOSED_LABEL}` : ""}
        </Alert>
      ) : vacancy.closed ? (
        <Alert tone="info">{VACANCY_CLOSED_LABEL}. Новые отклики на неё не принимаем.</Alert>
      ) : (
        <ApplyForm
          vacancyId={vacancy.id}
          title={vacancy.title}
          href={vacancy.href}
          defaultMessage={resumeTemplate}
        />
      )}

      <p>
        <Link href={vacancy.href} className={cn(buttonVariants({ variant: "ghost" }))}>
          К вакансии
        </Link>
      </p>
    </>
  );
}
