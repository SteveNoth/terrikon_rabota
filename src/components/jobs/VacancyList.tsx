import { VacancyCard } from "@/components/vacancy/VacancyCard";
import { OfflineCapture } from "@/components/offline/OfflineCapture";
import type { QualityFeatures } from "@/lib/quality/types";
import type { VacancyListItem } from "@/lib/repo/vacancies";

export function VacancyList({
  vacancies,
  features,
  safetyLink = false,
}: {
  vacancies: VacancyListItem[];
  features: Pick<QualityFeatures, "descriptionPreview" | "images">;
  safetyLink?: boolean;
}) {
  return (
    <>
      <OfflineCapture vacancies={vacancies} />
      <ul className="flex min-w-0 flex-col gap-3">
      {vacancies.map((vacancy) => (
        <li key={vacancy.id} className="min-w-0">
          <VacancyCard vacancy={vacancy} features={features} safetyLink={safetyLink} />
        </li>
      ))}
    </ul>
    </>
  );
}
