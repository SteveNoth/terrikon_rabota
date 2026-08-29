"use client";

import type { ChangeEvent } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useQuality } from "@/lib/quality/QualityProvider";
import type { QualityMode, QualityPreference } from "@/lib/quality/types";
import { cn } from "@/lib/format/cn";

const OPTIONS: { value: QualityPreference; label: string }[] = [
  { value: "auto", label: "Авто (рекомендуется)" },
  { value: "full", label: "Полное — красиво, больше трафика" },
  { value: "lite", label: "Экономное — быстро, мало трафика" },
  { value: "ultra", label: "Только текст — работает даже на 2G" },
];

const NOW_LABEL: Record<QualityMode, string> = {
  full: "Полное · красиво",
  lite: "Lite · экономно",
  ultra: "Только текст · 2G",
};

/** Ориентир по разделу 8.5, не живой замер. */
const WEIGHT_HINT: Record<QualityMode, string> = {
  full: "≈ 250 КБ",
  lite: "≈ 80 КБ",
  ultra: "≈ 25 КБ",
};

export function QualitySwitcher({
  id,
  compact = false,
  className,
}: {
  id: string;
  compact?: boolean;
  className?: string;
}) {
  const { mode, preference } = useQuality();
  const pathname = usePathname();

  function onChange(event: ChangeEvent<HTMLSelectElement>) {
    event.currentTarget.form?.requestSubmit();
  }

  return (
    <form
      method="GET"
      action={pathname}
      className={cn("flex min-w-0 flex-col gap-1", compact && "gap-0", className)}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <label htmlFor={id} className="shrink-0 text-sm text-muted">
          Качество
        </label>
        <Select
          id={id}
          name="mode"
          defaultValue={preference}
          key={preference}
          onChange={onChange}
          size="sm"
          autoComplete="off"
          aria-describedby={`${id}-now`}
          className="min-w-0 flex-1"
        >
          {OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="outline" size="sm">
          Применить
        </Button>
        {compact ? (
          <p id={`${id}-now`} className="max-w-xs shrink-0 truncate text-sm text-muted">
            {NOW_LABEL[mode]}
          </p>
        ) : null}
      </div>
      {compact ? null : (
        <p id={`${id}-now`} className="text-sm text-muted">
          Сейчас: {NOW_LABEL[mode]} · эта страница весит {WEIGHT_HINT[mode]}
        </p>
      )}
    </form>
  );
}
