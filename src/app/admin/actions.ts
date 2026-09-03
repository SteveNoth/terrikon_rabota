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
  type DecisionResult,
} from "@/lib/admin/decisions";
import {
  disableEmployerPublish,
  markForbiddenText,
  publishCabinetVacancy,
  rejectCabinetVacancy,
} from "@/lib/admin/employer-decisions";
import { AccountBlockScope } from "@prisma/client";
import { imposeAccountBlock, liftAccountBlock } from "@/lib/auth/blocks";
import { POLICY_PHRASES } from "@/lib/policy/messages";
import { bulkVacancies, saveVacancyFromForm } from "@/lib/admin/vacancies";
import { approvePostAsVacancy, rejectPost } from "@/lib/admin/posts";
import { acceptQuality, exportLearnedSamples } from "@/lib/admin/quality";
import { dismissReport, hideVacancyFromReport } from "@/lib/admin/reports";
import { listQueue, parseQueueTab, queuePath } from "@/lib/admin/queue";
import { setEmployerVerified } from "@/lib/admin/employers";

function withQuery(path: string, extra: Record<string, string | undefined>): string {
  const url = new URL(path, "http://local.invalid");
  for (const [key, value] of Object.entries(extra)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }
  return `${url.pathname}${url.search}`;
}

function redirectNotice(path: string, notice: string, extra?: string): never {
  redirect(withQuery(path, { notice, warn: extra }));
}

function failNotice(path: string, error: string): never {
  redirect(withQuery(path, { error }));
}

function queueTabFrom(formData: FormData) {
  return parseQueueTab(String(formData.get("tab") ?? "all"));
}

async function redirectQueue(formData: FormData, result: Extract<DecisionResult, { ok: true }>): Promise<never> {
  const tab = queueTabFrom(formData);
  const items = await listQueue(tab);
  redirectNotice(queuePath(tab, items[0]?.id), result.message, result.dictWarning);
}

function failQueue(formData: FormData, error: string): never {
  failNotice(queuePath(queueTabFrom(formData)), error);
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
    failQueue(formData, result.error);
  }
  await redirectQueue(formData, result);
}

export async function queuePublishTrustAction(formData: FormData) {
  await guard();
  const id = String(formData.get("id") ?? "");
  const result = await publishVacancy(id, true);
  if (!result.ok) {
    failQueue(formData, result.error);
  }
  await redirectQueue(formData, result);
}

export async function queueFraudAction(formData: FormData) {
  await guard();
  const id = String(formData.get("id") ?? "");
  const phrase = String(formData.get("phrase") ?? "");
  const result = await markFraud(id, phrase);
  if (!result.ok) {
    failQueue(formData, result.error);
  }
  await redirectQueue(formData, result);
}

export async function queueNotVacancyAction(formData: FormData) {
  await guard();
  const id = String(formData.get("id") ?? "");
  const stop = String(formData.get("stopWord") ?? "");
  const result = await markNotVacancy(id, stop);
  if (!result.ok) {
    failQueue(formData, result.error);
  }
  await redirectQueue(formData, result);
}

export async function queueApproveGroupAction(formData: FormData) {
  await guard();
  const id = String(formData.get("id") ?? "");
  const result = await approveGroup(id);
  if (!result.ok) {
    failQueue(formData, result.error);
  }
  await redirectQueue(formData, result);
}

export async function queueMergeAction(formData: FormData) {
  await guard();
  const id = String(formData.get("id") ?? "");
  const targetId = String(formData.get("duplicateOfId") ?? "").trim();
  if (!targetId) {
    failQueue(formData, "Выберите вакансию, дублем которой это является.");
  }
  const result = await mergeDuplicate(id, targetId);
  if (!result.ok) {
    failQueue(formData, result.error);
  }
  await redirectQueue(formData, result);
}

export async function unblockAction(formData: FormData) {
  await guard();
  const id = String(formData.get("id") ?? "");
  const result = await unblockToQueue(id);
  if (!result.ok) {
    failNotice("/admin/blocked", result.error);
  }
  redirectNotice(result.next || "/admin/blocked", result.message);
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

export async function employerVerifyAction(formData: FormData) {
  await guard();
  const id = String(formData.get("id") ?? "");
  const next = formData.get("verified") === "true";
  const result = await setEmployerVerified(id, next);
  if (!result.ok) {
    failNotice("/admin/employers", result.error);
  }
  redirectNotice("/admin/employers", next ? "Отметка «проверен» поставлена." : "Отметка «проверен» снята.");
}

function cabinetQueuePath(formData: FormData): string {
  const employerId = String(formData.get("employerId") ?? "");
  const id = String(formData.get("id") ?? "");
  const params = new URLSearchParams();
  if (employerId) {
    params.set("employerId", employerId);
  }
  if (id) {
    params.set("id", id);
  }
  const query = params.toString();
  return query ? `/admin/employers/queue?${query}` : "/admin/employers/queue";
}

export async function cabinetPublishAction(formData: FormData) {
  await guard();
  const id = String(formData.get("id") ?? "");
  const result = await publishCabinetVacancy(id, {});
  if (!result.ok) {
    failNotice(cabinetQueuePath(formData), result.error);
  }
  redirectNotice("/admin/employers/queue", result.message);
}

export async function cabinetPublishTrustAction(formData: FormData) {
  await guard();
  const id = String(formData.get("id") ?? "");
  const result = await publishCabinetVacancy(id, { trustContact: true });
  if (!result.ok) {
    failNotice(cabinetQueuePath(formData), result.error);
  }
  redirectNotice("/admin/employers/queue", result.message);
}

export async function cabinetPublishVerifyAction(formData: FormData) {
  await guard();
  const id = String(formData.get("id") ?? "");
  const result = await publishCabinetVacancy(id, { verifyCompany: true });
  if (!result.ok) {
    failNotice(cabinetQueuePath(formData), result.error);
  }
  redirectNotice("/admin/employers/queue", result.message);
}

export async function cabinetRejectAction(formData: FormData) {
  await guard();
  const id = String(formData.get("id") ?? "");
  const note = String(formData.get("note") ?? "");
  const result = await rejectCabinetVacancy(id, note);
  if (!result.ok) {
    failNotice(cabinetQueuePath(formData), result.error);
  }
  redirectNotice("/admin/employers/queue", result.message);
}

export async function cabinetForbiddenAction(formData: FormData) {
  await guard();
  const id = String(formData.get("id") ?? "");
  const result = await markForbiddenText(id);
  if (!result.ok) {
    failNotice(cabinetQueuePath(formData), result.error);
  }
  redirectNotice("/admin/employers/queue", result.message);
}

export async function cabinetDisablePublishAction(formData: FormData) {
  await guard();
  const id = String(formData.get("id") ?? "");
  const result = await disableEmployerPublish(id);
  if (!result.ok) {
    failNotice(cabinetQueuePath(formData), result.error);
  }
  redirectNotice("/admin/employers/queue", result.message);
}

export async function cabinetRestoreAction(formData: FormData) {
  await guard();
  const id = String(formData.get("id") ?? "");
  const result = await unblockToQueue(id);
  if (!result.ok) {
    failNotice(cabinetQueuePath(formData), result.error);
  }
  redirectNotice(result.next || "/admin/employers/queue", result.message);
}

export async function employerPublishBlockAction(formData: FormData) {
  await guard();
  const userId = String(formData.get("userId") ?? "");
  const result = await imposeAccountBlock({
    userId,
    scope: AccountBlockScope.PUBLISH,
    reason: "админка работодателей",
    publicNote: POLICY_PHRASES.publishBlocked,
  });
  if (!result.ok) {
    failNotice("/admin/employers", result.error);
  }
  redirectNotice("/admin/employers", result.message);
}

export async function employerPublishLiftAction(formData: FormData) {
  await guard();
  const userId = String(formData.get("userId") ?? "");
  const result = await liftAccountBlock({ userId, scope: AccountBlockScope.PUBLISH });
  if (!result.ok) {
    failNotice("/admin/employers", result.error);
  }
  redirectNotice("/admin/employers", result.message);
}

export async function userBlockAction(formData: FormData) {
  await guard();
  const userId = String(formData.get("userId") ?? "");
  const scopeRaw = String(formData.get("scope") ?? "");
  const scope =
    scopeRaw === "APPLY" ? AccountBlockScope.APPLY : scopeRaw === "LOGIN" ? AccountBlockScope.LOGIN : null;
  if (!scope) {
    failNotice("/admin/users", "Неизвестная область блока.");
  }
  const publicNote = scope === AccountBlockScope.LOGIN ? "Этот аккаунт заблокирован" : "Отклик с этого аккаунта сейчас недоступен. Если это ошибка — напишите нам.";
  const result = await imposeAccountBlock({
    userId,
    scope,
    reason: "админка аккаунтов",
    publicNote,
  });
  if (!result.ok) {
    failNotice("/admin/users", result.error);
  }
  redirectNotice("/admin/users", result.message);
}

export async function userLiftAction(formData: FormData) {
  await guard();
  const userId = String(formData.get("userId") ?? "");
  const scopeRaw = String(formData.get("scope") ?? "");
  const scope =
    scopeRaw === "APPLY"
      ? AccountBlockScope.APPLY
      : scopeRaw === "LOGIN"
        ? AccountBlockScope.LOGIN
        : scopeRaw === "PUBLISH"
          ? AccountBlockScope.PUBLISH
          : null;
  if (!scope) {
    failNotice("/admin/users", "Неизвестная область блока.");
  }
  const result = await liftAccountBlock({ userId, scope });
  if (!result.ok) {
    failNotice("/admin/users", result.error);
  }
  redirectNotice("/admin/users", result.message);
}
