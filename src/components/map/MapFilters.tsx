import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/format/cn";
import type { District } from "@/lib/geo";
import type { Sphere } from "@/lib/professions";
import type { ReactNode } from "react";

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

export function MapFilters({
  citySlug,
  sphere,
  salaryFrom,
  district,
  spheres,
  districts,
}: {
  citySlug: string;
  sphere?: string;
  salaryFrom?: number;
  district?: string;
  spheres: Sphere[];
  districts: District[];
}) {
  const action = `/${citySlug}/map`;
  const hasFilters = Boolean(sphere || salaryFrom != null || district);

  return (
    <form
      method="GET"
      action={action}
      className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-4 md:flex-row md:flex-wrap md:items-end"
    >
      <Field id="map-sphere" label="Сфера">
        <Select id="map-sphere" name="sphere" defaultValue={sphere ?? ""} autoComplete="off">
          <option value="">Все сферы</option>
          {spheres.map((item) => (
            <option key={item.slug} value={item.slug}>
              {item.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="map-salary" label="Зарплата от">
        <Input
          id="map-salary"
          type="number"
          name="salaryFrom"
          min={0}
          step={1000}
          inputMode="numeric"
          defaultValue={salaryFrom ?? ""}
          placeholder="₽"
          autoComplete="off"
        />
      </Field>
      {districts.length > 0 ? (
        <Field id="map-district" label="Район">
          <Select id="map-district" name="district" defaultValue={district ?? ""} autoComplete="off">
            <option value="">Весь город</option>
            {districts.map((item) => (
              <option key={item.slug} value={item.slug}>
                {item.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary">
          Показать
        </Button>
        {hasFilters ? (
          <a href={action} className={cn(buttonVariants({ variant: "ghost" }))}>
            Сбросить
          </a>
        ) : null}
      </div>
    </form>
  );
}
