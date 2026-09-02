"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { createApplication, saveSeekerProfile } from "@/lib/repo/seeker";
import { APPLY_BLOCKED_MESSAGE } from "@/lib/auth/blocks";

function formString(form: FormData, name: string): string {
  const raw = form.get(name);
  return typeof raw === "string" ? raw : "";
}

function fail(path: string, error: string): never {
  redirect(`${path}?error=${encodeURIComponent(error)}`);
}

function ok(path: string, notice: string): never {
  redirect(`${path}?notice=${encodeURIComponent(notice)}`);
}

export async function saveSeekerProfileAction(formData: FormData) {
  const user = await requireUser("/profile");
  const result = await saveSeekerProfile(user.id, formData);
  if (!result.ok) {
    fail("/profile", result.error);
  }
  ok("/profile", "Профиль сохранён.");
}

export async function applyAction(formData: FormData) {
  const vacancyId = formString(formData, "vacancyId");
  const next = vacancyId ? `/profile/apply/${vacancyId}` : "/profile";
  const user = await requireUser(next);
  const result = await createApplication(user.id, vacancyId, formString(formData, "message"));
  if (!result.ok) {
    fail(next, result.code === "blocked" ? APPLY_BLOCKED_MESSAGE : result.error);
  }
  if (result.duplicate) {
    ok(next, "Вы уже откликались на эту вакансию.");
  }
  ok("/profile/applications", "Отклик отправлен. Работодатель увидит его в кабинете.");
}
