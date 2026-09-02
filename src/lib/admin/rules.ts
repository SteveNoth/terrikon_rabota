import { prisma } from "@/lib/adapters/db";
import { RULE_CANDIDATE_MAX_ACCURACY, RULE_CANDIDATE_MIN_FIRES } from "@/lib/admin/constants";
import { isDuplicateFlag, isFraudFlag, isVacancyDoubtFlag, parseTrustFlags, type TrustFlag } from "@/lib/admin/flags";

export type RuleAccuracy = {
  id: string;
  label: string;
  fires: number;
  agreed: number;
  accuracy: number;
  candidate: boolean;
};

function categoryOf(flag: TrustFlag): "fraud" | "vacancy" | "duplicate" | "other" {
  if (isVacancyDoubtFlag(flag)) {
    return "vacancy";
  }
  if (isDuplicateFlag(flag)) {
    return "duplicate";
  }
  if (isFraudFlag(flag) || flag.id === "new_contact") {
    return "fraud";
  }
  return "other";
}

function agreedWith(decision: string, flag: TrustFlag): boolean {
  const category = categoryOf(flag);
  if (decision === "FRAUD" || decision === "BLOCK") {
    return category === "fraud";
  }
  if (decision === "NOT_VACANCY") {
    return category === "vacancy";
  }
  if (decision === "MERGE_DUPLICATE" || decision === "APPROVE_GROUP") {
    return category === "duplicate";
  }
  if (decision === "PUBLISH" || decision === "PUBLISH_TRUST") {
    return false;
  }
  return false;
}

/**
 * Сработало N раз, я согласился M раз.
 * Публикация = правило сработало напрасно. Мошенничество = согласие с fraud-правилами.
 */
export async function ruleAccuracy(): Promise<RuleAccuracy[]> {
  const rows = await prisma.moderationDecision.findMany({
    select: { decision: true, triggeredRules: true },
    take: 5000,
    orderBy: { decidedAt: "desc" },
  });
  const stats = new Map<string, { label: string; fires: number; agreed: number }>();
  for (const row of rows) {
    const flags = parseTrustFlags(row.triggeredRules);
    for (const flag of flags) {
      const current = stats.get(flag.id) ?? { label: flag.label || flag.id, fires: 0, agreed: 0 };
      current.fires += 1;
      if (agreedWith(row.decision, flag)) {
        current.agreed += 1;
      }
      if (!current.label && flag.label) {
        current.label = flag.label;
      }
      stats.set(flag.id, current);
    }
  }
  return [...stats.entries()]
    .map(([id, value]) => {
      const accuracy = value.fires === 0 ? 0 : value.agreed / value.fires;
      return {
        id,
        label: value.label,
        fires: value.fires,
        agreed: value.agreed,
        accuracy,
        candidate: value.fires >= RULE_CANDIDATE_MIN_FIRES && accuracy <= RULE_CANDIDATE_MAX_ACCURACY,
      };
    })
    .sort((a, b) => a.accuracy - b.accuracy || b.fires - a.fires);
}
