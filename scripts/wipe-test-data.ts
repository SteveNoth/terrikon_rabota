/**
 * Удаляет тестовые вакансии (seed / send-test / кабинетные TestTest)
 * и все учётки сайта. Словари профессий и живые вакансии парсеров не трогает.
 *
 *   npx tsx scripts/wipe-test-data.ts --dry-run
 *   npx tsx scripts/wipe-test-data.ts --apply
 */
import "./load-env";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "../src/lib/adapters/db";
import { recomputeVacancyCounts } from "../src/lib/hygiene/counters";

function isTestVacancy(row: {
  title: string;
  rawText: string | null;
  externalId: string;
  sourceUrl: string | null;
  sourceName: string | null;
  normalizerVersion: string;
}): boolean {
  const blob = `${row.title} ${row.rawText ?? ""} ${row.externalId} ${row.sourceUrl ?? ""} ${row.sourceName ?? ""} ${row.normalizerVersion}`.toLowerCase();
  return (
    row.externalId.startsWith("seed-") ||
    row.externalId.startsWith("send-test") ||
    row.externalId.startsWith("yamal-") ||
    row.normalizerVersion.startsWith("seed") ||
    Boolean(row.sourceUrl?.includes("example.com")) ||
    blob.includes("testtest") ||
    blob.includes("нужно кокать")
  );
}

function applyRequested(): boolean {
  return process.argv.includes("--apply");
}

async function deleteAuthUsers(): Promise<number> {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) {
    console.log("Supabase Auth: нет URL или service_role — учётки входа не удалял.");
    return 0;
  }
  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  let deleted = 0;
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) {
      throw new Error(`Supabase Auth listUsers: ${error.message}`);
    }
    const users = data.users ?? [];
    if (users.length === 0) break;
    for (const user of users) {
      const result = await admin.auth.admin.deleteUser(user.id);
      if (result.error) {
        throw new Error(`Supabase Auth deleteUser: ${result.error.message}`);
      }
      deleted += 1;
    }
    if (users.length < 100) break;
    page += 1;
  }
  return deleted;
}

async function main() {
  const dryRun = !applyRequested();
  const vacancies = await prisma.vacancy.findMany({
    select: {
      id: true,
      title: true,
      rawText: true,
      externalId: true,
      sourceUrl: true,
      sourceName: true,
      normalizerVersion: true,
      employerId: true,
    },
  });
  const testIds = vacancies.filter(isTestVacancy).map((row) => row.id);
  const userCount = await prisma.user.count();
  const cabinetEmployers = await prisma.employer.count({ where: { userId: { not: null } } });

  console.log(
    dryRun
      ? `Проверка: удалю вакансий ${testIds.length}, учёток ${userCount}, кабинетных работодателей ${cabinetEmployers}.`
      : `Применяю: вакансий ${testIds.length}, учёток ${userCount}.`,
  );

  if (dryRun) {
    console.log("Это был просмотр. Чтобы удалить: npx tsx scripts/wipe-test-data.ts --apply");
    return;
  }

  if (testIds.length > 0) {
    await prisma.application.deleteMany({ where: { vacancyId: { in: testIds } } });
    await prisma.favorite.deleteMany({ where: { vacancyId: { in: testIds } } });
    await prisma.report.deleteMany({ where: { vacancyId: { in: testIds } } });
    await prisma.telegramDelivery.deleteMany({ where: { vacancyId: { in: testIds } } });
    await prisma.vacancy.updateMany({
      where: { id: { in: testIds } },
      data: { groupId: null, duplicateOfId: null, employerId: null },
    });
    await prisma.vacancy.deleteMany({ where: { id: { in: testIds } } });
  }

  await prisma.application.deleteMany();
  await prisma.favorite.deleteMany();
  await prisma.accountBlock.deleteMany();
  await prisma.employer.updateMany({ data: { userId: null } });
  await prisma.user.deleteMany();

  const leftover = await prisma.employer.findMany({
    where: { vacancies: { none: {} } },
    select: { id: true },
  });
  if (leftover.length > 0) {
    const ids = leftover.map((row) => row.id);
    await prisma.employerStatDaily.deleteMany({ where: { employerId: { in: ids } } });
    await prisma.event.deleteMany({ where: { employerId: { in: ids } } });
    await prisma.employer.deleteMany({ where: { id: { in: ids } } });
  }

  const authDeleted = await deleteAuthUsers();
  const counts = await recomputeVacancyCounts();
  const left = await prisma.vacancy.count();
  console.log(
    `Готово: вакансий осталось ${left}, Auth удалён ${authDeleted}, счётчики городов ${counts.cities}.`,
  );
}

main()
  .catch((cause) => {
    console.error(cause instanceof Error ? cause.message : cause);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
