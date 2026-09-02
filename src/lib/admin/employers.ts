import { prisma } from "@/lib/adapters/db";

export async function listAdminEmployers() {
  return prisma.employer.findMany({
    orderBy: [{ isVerified: "desc" }, { createdAt: "desc" }],
    take: 200,
    include: {
      user: { select: { id: true, email: true, name: true, role: true, publishBlocked: true, applyBlocked: true, loginBlocked: true } },
      _count: { select: { vacancies: true } },
    },
  });
}

export async function setEmployerVerified(
  id: string,
  isVerified: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await prisma.employer.findUnique({ where: { id }, select: { id: true } });
  if (!row) {
    return { ok: false, error: "Работодатель не найден." };
  }
  await prisma.employer.update({ where: { id }, data: { isVerified } });
  return { ok: true };
}
