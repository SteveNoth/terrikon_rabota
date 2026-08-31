"use server";

import { headers } from "next/headers";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminCookieOptions, allowLoginAttempt, isAdminRequest, signAdminSession, verifyAdminPassword } from "@/lib/admin/auth";
import { ADMIN_COOKIE } from "@/lib/admin/constants";
import {
  approveGroup,
  markFraud,
  markNotVacancy,
  mergeDuplicate,
  publishVacancy,
  unblockToQueue,
} from "@/lib/admin/decisions";
import { bulkVacancies, saveVacancyFromForm } from "@/lib/admin/vacancies";
import { approvePostAsVacancy, rejectPost } from "@/lib/admin/posts";
import { acceptQuality, exportLearnedSamples } from "@/lib/admin/quality";
import { dismissReport, hideVacancyFromReport } from "@/lib/admin/reports";

function redirectNotice(path: string, notice: string, extra?: string): never {
  const url = extra
    ? `${path}?notice=${encodeURIComponent(notice)}&warn=${encodeURIComponent(extra)}`
    : `${path}?notice=${encodeURIComponent(notice)}`;
  redirect(url);
}

function failNotice(path: string, error: string): never {
  redirect(`${path}?error=${encodeURIComponent(error)}`);
}

async function guard() {
  if (!(await isAdminRequest())) {
    redirect("/admin");
  }
}

function clientKeyFromHeaders(headerList: Headers): string {
  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "local";
  }
  return headerList.get("x-real-ip")?.trim() || "local";
}

export async function loginAction(formData: FormData) {
  const headerList = await headers();
  if (!allowLoginAttempt(clientKeyFromHeaders(headerList))) {
    failNotice("/admin", "Слишком много попыток. Подождите четверть часа.");
  }
  const password = String(formData.get("password") ?? "");
  if (!verifyAdminPassword(password)) {
    failNotice("/admin", "Неверный пароль.");
  }
  const token = signAdminSession();
  if (!token) {
    failNotice("/admin", "Пароль администратора не задан в окружении.");
  }
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, token, adminCookieOptions());
  redirect("/admin");
}

export async function logoutAction() {
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, "", adminCookieOptions(0));
  redirect("/admin");
}

export async function queuePublishAction(formData: FormData) {
  await guard();
  const id = String(formData.get("id") ?? "");
  const result = await publishVacancy(id, false);
  if (!result.ok) {
    failNotice("/admin/queue", result.error);
  }
  redirectNotice("/admin/queue", result.message);
}

export async function queuePublishTrustAction(formData: FormData) {
  await guard();
  const id = String(formData.get("id") ?? "");
  const result = await publishVacancy(id, true);
  if (!result.ok) {
    failNotice("/admin/queue", result.error);
  }
  redirectNotice("/admin/queue", result.message);
}

export async function queueFraudAction(formData: FormData) {
  await guard();
  const id = String(formData.get("id") ?? "");
  const phrase = String(formData.get("phrase") ?? "");
  const result = await markFraud(id, phrase);
  if (!result.ok) {
    failNotice("/admin/queue", result.error);
  }
  redirectNotice("/admin/queue", result.message, result.dictWarning);
}

export async function queueNotVacancyAction(formData: FormData) {
  await guard();
  const id = String(formData.get("id") ?? "");
  const stop = String(formData.get("stopWord") ?? "");
  const result = await markNotVacancy(id, stop);
  if (!result.ok) {
    failNotice("/admin/queue", result.error);
  }
  redirectNotice("/admin/queue", result.message, result.dictWarning);
}

export async function queueApproveGroupAction(formData: FormData) {
  await guard();
  const id = String(formData.get("id") ?? "");
  const result = await approveGroup(id);
  if (!result.ok) {
    failNotice("/admin/queue", result.error);
  }
  redirectNotice("/admin/queue", result.message);
}

export async function queueMergeAction(formData: FormData) {
  await guard();
  const id = String(formData.get("id") ?? "");
  const targetId = String(formData.get("duplicateOfId") ?? "");
  if (!targetId) {
    failNotice("/admin/queue", "Выберите вакансию, дублем которой это является.");
  }
  const result = await mergeDuplicate(id, targetId);
  if (!result.ok) {
    failNotice("/admin/queue", result.error);
  }
  redirectNotice("/admin/queue", result.message);
}

export async function unblockAction(formData: FormData) {
  await guard();
  const id = String(formData.get("id") ?? "");
  const result = await unblockToQueue(id);
  if (!result.ok) {
    failNotice("/admin/blocked", result.error);
  }
  redirectNotice("/admin/blocked", result.message);
}

export async function saveVacancyAction(formData: FormData) {
  await guard();
  const id = String(formData.get("id") ?? "") || undefined;
  const result = await saveVacancyFromForm(formData, id);
  if (!result.ok) {
    const back = id ? `/admin/vacancies/${id}` : "/admin/vacancies/new";
    failNotice(back, result.error);
  }
  redirectNotice(`/admin/vacancies/${result.id}`, "Сохранено.");
}

export async function bulkVacanciesAction(formData: FormData) {
  await guard();
  const action = String(formData.get("bulk") ?? "") as "activate" | "deactivate" | "delete";
  const ids = formData.getAll("ids").map(String);
  const result = await bulkVacancies(ids, action);
  if (!result.ok) {
    failNotice("/admin/vacancies", result.error);
  }
  redirectNotice("/admin/vacancies", `Готово: ${result.count}.`);
}

export async function postApproveAction(formData: FormData) {
  await guard();
  const id = String(formData.get("id") ?? "");
  const result = await approvePostAsVacancy({
    id,
    addProfessionName: String(formData.get("professionName") ?? ""),
    sphere: String(formData.get("sphere") ?? ""),
  });
  if (!result.ok) {
    failNotice("/admin/posts", result.error);
  }
  redirectNotice("/admin/posts", "Это вакансия: карточка создана и видна на сайте.");
}

export async function postRejectAction(formData: FormData) {
  await guard();
  const id = String(formData.get("id") ?? "");
  const result = await rejectPost(id);
  if (!result.ok) {
    failNotice("/admin/posts", result.error);
  }
  redirectNotice("/admin/posts", "Не вакансия.");
}

export async function postRejectStopAction(formData: FormData) {
  await guard();
  const id = String(formData.get("id") ?? "");
  const stop = String(formData.get("stopWord") ?? "");
  const result = await rejectPost(id, stop);
  if (!result.ok) {
    failNotice("/admin/posts", result.error);
  }
  redirectNotice("/admin/posts", "Не вакансия, стоп-слово добавлено в словарь.", result.dictWarning);
}

export async function qualityAcceptAction(formData: FormData) {
  await guard();
  const id = String(formData.get("id") ?? "");
  const result = await acceptQuality(id, null, "accept");
  if (!result.ok) {
    failNotice("/admin/quality", result.error);
  }
  redirectNotice("/admin/quality", "Обработка принята.");
}

export async function qualityEditAction(formData: FormData) {
  await guard();
  const id = String(formData.get("id") ?? "");
  const result = await acceptQuality(id, formData, "edit");
  if (!result.ok) {
    failNotice("/admin/quality", result.error);
  }
  redirectNotice("/admin/quality", "Принято с правкой. Пара оригинал → результат записана в выборку.");
}

export async function qualityRejectAction(formData: FormData) {
  await guard();
  const id = String(formData.get("id") ?? "");
  const result = await acceptQuality(id, null, "reject");
  if (!result.ok) {
    failNotice("/admin/quality", result.error);
  }
  redirectNotice("/admin/quality", "Обработка отклонена, на карточке будет оригинал.");
}

export async function qualityExportAction() {
  await guard();
  const result = await exportLearnedSamples();
  if (!result.ok) {
    failNotice("/admin/quality", result.error);
  }
  redirectNotice("/admin/quality", `Выгружено ${result.count} примеров в tests/normalization/learned.json`);
}

export async function reportHideAction(formData: FormData) {
  await guard();
  const id = String(formData.get("id") ?? "");
  const result = await hideVacancyFromReport(id);
  if (!result.ok) {
    failNotice("/admin/reports", result.error);
  }
  redirectNotice("/admin/reports", "Вакансия скрыта.");
}

export async function reportDismissAction(formData: FormData) {
  await guard();
  const id = String(formData.get("id") ?? "");
  const result = await dismissReport(id);
  if (!result.ok) {
    failNotice("/admin/reports", result.error);
  }
  redirectNotice("/admin/reports", "Жалоба отклонена.");
}
