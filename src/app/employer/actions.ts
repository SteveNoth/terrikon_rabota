"use server";

import { redirect } from "next/navigation";
import { requireEmployer } from "@/lib/auth/guard";
import {
  saveCompanyProfile,
  saveEmployerVacancy,
  setApplicationStatus,
  setVacancyActive,
} from "@/lib/repo/employer";
import type { ApplicationStatus } from "@prisma/client";

function fail(path: string, error: string): never {
  redirect(`${path}?error=${encodeURIComponent(error)}`);
}

function ok(path: string, notice: string): never {
  redirect(`${path}?notice=${encodeURIComponent(notice)}`);
}

function review(path: string, text: string): never {
  redirect(`${path}?review=${encodeURIComponent(text)}`);
}

function finishDashboard(result: { notice?: string; noticeKind?: "notice" | "review" | "error" }): never {
  const text = result.notice || "Сохранено.";
  if (result.noticeKind === "review") {
    review("/employer/dashboard", text);
  }
  if (result.noticeKind === "error") {
    fail("/employer/dashboard", text);
  }
  ok("/employer/dashboard", text);
}

function formString(form: FormData, name: string): string {
  const raw = form.get(name);
  return typeof raw === "string" ? raw : "";
}

export async function saveProfileAction(formData: FormData) {
  const user = await requireEmployer();
  const result = await saveCompanyProfile(user.employerId, formData);
  if (!result.ok) {
    fail("/employer/dashboard", result.error);
  }
  ok("/employer/dashboard", "Профиль компании сохранён.");
}

export async function saveVacancyAction(formData: FormData) {
  const user = await requireEmployer();
  const id = formString(formData, "id");
  const result = await saveEmployerVacancy(user.employerId, formData, id || undefined, {
    userId: user.id,
    publishBlocked: user.publishBlocked,
  });
  if (!result.ok) {
    const back = id ? `/employer/vacancies/${id}` : "/employer/vacancies/new";
    fail(back, result.error);
  }
  finishDashboard(result);
}

export async function deactivateVacancyAction(formData: FormData) {
  const user = await requireEmployer();
  const id = formString(formData, "id");
  const result = await setVacancyActive(user.employerId, id, false, {
    userId: user.id,
    publishBlocked: user.publishBlocked,
  });
  if (!result.ok) {
    fail("/employer/dashboard", result.error);
  }
  finishDashboard(result);
}

export async function activateVacancyAction(formData: FormData) {
  const user = await requireEmployer();
  const id = formString(formData, "id");
  const result = await setVacancyActive(user.employerId, id, true, {
    userId: user.id,
    publishBlocked: user.publishBlocked,
  });
  if (!result.ok) {
    fail("/employer/dashboard", result.error);
  }
  finishDashboard(result);
}

export async function applicationStatusAction(formData: FormData) {
  const user = await requireEmployer();
  const id = formString(formData, "id");
  const status = formString(formData, "status") as ApplicationStatus;
  const result = await setApplicationStatus(user.employerId, id, status);
  if (!result.ok) {
    fail("/employer/dashboard", result.error);
  }
  ok("/employer/dashboard", "Статус отклика обновлён.");
}
