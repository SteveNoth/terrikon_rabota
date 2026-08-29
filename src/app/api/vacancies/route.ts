import { WorkFormat, type Source } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCity } from "@/lib/geo";
import { listVacancies } from "@/lib/repo/vacancies";
import { parseVacancyQuery } from "@/lib/validation/vacancy-query";

export const dynamic = "force-dynamic";

const CITY_IN_DEVELOPMENT_MESSAGE = "Город в процессе подключения";

function json(body: unknown, init?: { status?: number; headers?: HeadersInit }) {
  return NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: {
      "Cache-Control": "private, no-store",
      ...init?.headers,
    },
  });
}

export async function GET(request: Request) {
  const started = performance.now();
  const url = new URL(request.url);
  const query = parseVacancyQuery(url.searchParams);
  const city = getCity(query.city);

  if (!city) {
    return json(
      { message: `Города «${query.city}» нет в справочнике.` },
      { status: 404 },
    );
  }

  if (city.status !== "active") {
    if (city.status === "soon") {
      const elapsed = Math.round(performance.now() - started);
      return json(
        {
          vacancies: [],
          total: 0,
          page: query.page,
          pageSize: query.pageSize,
          pages: 0,
          workFormat: query.workFormat,
          cityStatus: city.status,
          cityInDevelopment: true,
          message: CITY_IN_DEVELOPMENT_MESSAGE,
        },
        { headers: { "Server-Timing": `total;dur=${elapsed}` } },
      );
    }

    return json(
      { message: `Город «${city.name.nom}» пока не подключается.` },
      { status: 404 },
    );
  }

  try {
    const result = await listVacancies({
      citySlug: city.slug,
      sphere: query.sphere,
      professionSlug: query.profession,
      salaryFrom: query.salaryFrom,
      schedule: query.schedule,
      experience: query.experience,
      employmentType: query.employmentType,
      districtSlug: query.district,
      q: query.q,
      sort: query.sort,
      page: query.page,
      pageSize: query.pageSize,
      workFormat: query.workFormat as WorkFormat,
      publishedDays: query.publishedDays,
      hasSalary: query.hasSalary,
      verifiedOnly: query.verifiedOnly,
      source: query.source as Source | undefined,
      destination: query.destination,
      vahtaDays: query.vahtaDays,
      rotation: query.rotation,
      housing: query.housing,
      meals: query.meals,
      travel: query.travel,
      direct: query.direct,
    });

    const elapsed = Math.round(performance.now() - started);
    return json(
      {
        vacancies: result.vacancies,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        pages: result.pages,
        workFormat: query.workFormat,
        cityStatus: city.status,
        cityInDevelopment: false,
        message: null,
      },
      { headers: { "Server-Timing": `total;dur=${elapsed}` } },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Не удалось загрузить вакансии. Попробуйте обновить страницу.";
    return json({ message }, { status: 500 });
  }
}
