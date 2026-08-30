/**
 * qualityScore — не то же самое, что trustScore.
 * completeness (Этап 14) говорит, насколько объявление полное.
 * Полные карточки должны вставать выше в выдаче: сортировка смотрит на qualityScore.
 */
export function qualityScoreFrom(input: {
  completeness: number;
  hasSalary: boolean;
  hasContact: boolean;
  descriptionLength: number;
}): number {
  const completeness = clamp(Math.round(input.completeness), 0, 100);
  const extra =
    (input.hasSalary ? 4 : 0) + (input.hasContact ? 4 : 0) + (input.descriptionLength >= 200 ? 2 : 0);
  return clamp(Math.round(completeness * 0.9 + extra), 0, 100);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
