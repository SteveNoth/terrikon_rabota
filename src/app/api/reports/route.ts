import { NextResponse, type NextRequest } from "next/server";
import { createVacancyReport } from "@/lib/repo/reports";
import { isReportReason } from "@/lib/vacancy/reports";
import { vacancyPath } from "@/lib/vacancy/path";

export const dynamic = "force-dynamic";

function asString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const vacancyId = asString(form.get("vacancyId"));
  const city = asString(form.get("city"));
  const slug = asString(form.get("slug"));
  const reason = asString(form.get("reason"));
  const commentRaw = asString(form.get("comment"));
  const comment = commentRaw ? commentRaw.slice(0, 2000) : null;

  const origin = request.headers.get("origin") || request.nextUrl.origin;
  const target = (status: "ok" | "error") => {
    const path = city && slug ? vacancyPath(city, slug) : "/";
    return NextResponse.redirect(new URL(`${path}?report=${status}#report`, origin), { status: 303 });
  };

  if (!vacancyId || !isReportReason(reason)) {
    return target("error");
  }

  try {
    await createVacancyReport({ vacancyId, reason, comment });
  } catch {
    return target("error");
  }

  return target("ok");
}
