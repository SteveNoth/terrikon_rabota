import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/adapters/auth";
import { prisma } from "@/lib/adapters/db";
import { syncSeekerFavorites } from "@/lib/repo/seeker";
import { toOfflineVacancy } from "@/lib/offline/vacancy";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  items: z
    .array(
      z.object({
        vacancyId: z.string().min(8).max(64),
        addedAt: z.number().optional(),
      }),
    )
    .max(200)
    .default([]),
});

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Переносит избранное из IndexedDB в аккаунт после входа.
 * Без регистрации закладка уже работает в браузере — иначе человек уйдёт.
 */
export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) {
    return json({ ok: false, message: "Нужен вход." }, 401);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ ok: false, message: "Не удалось прочитать запрос." }, 400);
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return json({ ok: false, message: "Некорректный список." }, 400);
  }

  const rows = await syncSeekerFavorites(user.id, parsed.data.items);
  const ids = rows.map((row) => row.vacancyId);
  const vacancies =
    ids.length === 0
      ? []
      : await prisma.vacancy.findMany({
          where: { id: { in: ids } },
          select: {
            id: true,
            slug: true,
            title: true,
            summaryLine: true,
            salaryFrom: true,
            salaryTo: true,
            salaryPeriod: true,
            salaryCurrency: true,
            citySlug: true,
            districtSlug: true,
            sphere: true,
            professionSlug: true,
            schedule: true,
            experience: true,
            employmentType: true,
            workFormat: true,
            workLocationText: true,
            workCitySlug: true,
            rotationPattern: true,
            publishedAt: true,
            qualityScore: true,
            completeness: true,
            source: true,
            sourceName: true,
            salaryIsGross: true,
            isActive: true,
            employer: {
              select: { slug: true, name: true, isVerified: true, logoUrl: true },
            },
          },
        });
  const byId = new Map(vacancies.map((item) => [item.id, item]));

  return json({
    ok: true,
    items: rows.map((row) => {
      const vacancy = byId.get(row.vacancyId);
      return {
        vacancyId: row.vacancyId,
        addedAt: row.addedAt.toISOString(),
        vacancy: vacancy ? { ...vacancy, href: row.href } : null,
        snapshot: vacancy ? toOfflineVacancy(vacancy, row.addedAt.getTime()) : null,
      };
    }),
  });
}
