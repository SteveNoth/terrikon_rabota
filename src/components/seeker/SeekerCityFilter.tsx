import { Label } from "@/components/ui/label";
import { FIELD_CLASS } from "@/lib/auth/constants";
import { activeCityFilterOptions } from "@/lib/seeker/city-filter";

export function SeekerCityFilter({
  action,
  current,
}: {
  action: string;
  current: string | null;
}) {
  const cities = activeCityFilterOptions();

  return (
    <form method="GET" action={action} className="flex min-w-0 flex-wrap items-end gap-2">
      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor="seeker-city-filter" tone="muted">
          Город
        </Label>
        <select id="seeker-city-filter" name="city" defaultValue={current ?? ""} className={FIELD_CLASS}>
          <option value="">все активные города</option>
          {cities.map((city) => (
            <option key={city.slug} value={city.slug}>
              {city.label}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className="min-h-tap rounded-md border border-border bg-surface px-3 text-sm">
        Показать
      </button>
    </form>
  );
}
