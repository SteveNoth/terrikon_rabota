/** Ключ контакта как в trust.py: телефон или @username строчными. */

export function contactKey(phone: string | null | undefined, telegram: string | null | undefined): string | null {
  const fromPhone = (phone ?? "").trim();
  if (fromPhone) {
    return fromPhone;
  }
  const raw = (telegram ?? "").trim();
  if (!raw) {
    return null;
  }
  const token = raw.startsWith("@") ? raw : `@${raw}`;
  return token.toLowerCase();
}

export function blockReasonForFlags(flagIds: string[]): string {
  if (flagIds.some((id) => id.includes("predoplat") || id.includes("zalog") || id.includes("vznos") || id.includes("depozit"))) {
    return "предоплата от соискателя";
  }
  if (flagIds.some((id) => id.includes("kart") || id.includes("sim_") || id.includes("obnal") || id.includes("podstav"))) {
    return "дропперство / оформление карт";
  }
  if (flagIds.some((id) => id.includes("klad") || id.includes("rasfasov") || id.includes("courier"))) {
    return "клады / курьер с ежедневной оплатой";
  }
  if (flagIds.some((id) => id.includes("traffick"))) {
    return "признаки торговли людьми";
  }
  return "жёсткий флаг оценки доверия";
}
