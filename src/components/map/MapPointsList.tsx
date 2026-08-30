import { NavigatorLink } from "@/components/map/NavigatorLink";
import { formatMoney } from "@/lib/format/money";
import { districtName } from "@/lib/geo";
import { geocodeAccuracyNote } from "@/lib/geo/geocode-query";
import { navigatorHrefForRecord } from "@/lib/maps/points";
import type { MapVacancyRecord } from "@/lib/repo/vacancies";
import { vacancyPath } from "@/lib/vacancy/path";
import Link from "next/link";

export function MapPointsList({
  citySlug,
  records,
}: {
  citySlug: string;
  records: MapVacancyRecord[];
}) {
  if (records.length === 0) {
    return null;
  }

  return (
    <ul className="flex min-w-0 flex-col gap-3">
      {records.map((record) => {
        const place = districtName(citySlug, record.districtSlug);
        const note = geocodeAccuracyNote(record.geocodeAccuracy);
        const nav = navigatorHrefForRecord(record);
        return (
          <li key={record.id} className="rounded-lg border border-border bg-surface p-4">
            <p className="font-display text-lg font-medium">
              <Link href={vacancyPath(citySlug, record.slug)} className="text-brand underline-offset-2 hover:underline">
                {record.title}
              </Link>
            </p>
            <p className="font-medium">{formatMoney(record)}</p>
            {place ? <p className="text-sm text-muted">{place}</p> : null}
            {record.address ? <p className="min-w-0 break-words text-sm">{record.address}</p> : null}
            {note ? <p className="text-sm text-muted">{note}</p> : null}
            {nav ? (
              <p className="mt-2">
                <NavigatorLink href={nav} />
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
