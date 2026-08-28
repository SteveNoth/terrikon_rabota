"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/format/cn";
import { useUiMode } from "@/components/ui/mode-provider";

export const ICON_NAMES = [
  "search",
  "filter",
  "close",
  "check",
  "chevron-left",
  "chevron-right",
  "chevron-up",
  "chevron-down",
  "star",
  "phone",
  "location",
  "clock",
  "wallet",
  "menu",
  "home",
  "profile",
  "sphere-production",
  "sphere-construction",
  "sphere-trade",
  "sphere-transport",
  "sphere-medicine",
  "sphere-education",
  "sphere-it",
  "sphere-services",
] as const;

export type IconName = (typeof ICON_NAMES)[number];

export const ICON_LABELS: Record<IconName, string> = {
  search: "Поиск",
  filter: "Фильтр",
  close: "Закрыть",
  check: "Готово",
  "chevron-left": "Назад",
  "chevron-right": "Вперёд",
  "chevron-up": "Вверх",
  "chevron-down": "Вниз",
  star: "Избранное",
  phone: "Телефон",
  location: "Адрес",
  clock: "Время",
  wallet: "Зарплата",
  menu: "Меню",
  home: "Главная",
  profile: "Профиль",
  "sphere-production": "Производство",
  "sphere-construction": "Стройка",
  "sphere-trade": "Торговля",
  "sphere-transport": "Транспорт",
  "sphere-medicine": "Медицина",
  "sphere-education": "Образование",
  "sphere-it": "IT",
  "sphere-services": "Услуги",
};

export const ICON_GLYPHS: Record<IconName, string> = {
  search: "⌕",
  filter: "▽",
  close: "×",
  check: "✓",
  "chevron-left": "‹",
  "chevron-right": "›",
  "chevron-up": "˄",
  "chevron-down": "˅",
  star: "★",
  phone: "☎",
  location: "⌖",
  clock: "◷",
  wallet: "▣",
  menu: "☰",
  home: "⌂",
  profile: "☺",
  "sphere-production": "⚙",
  "sphere-construction": "△",
  "sphere-trade": "⇄",
  "sphere-transport": "▷",
  "sphere-medicine": "✚",
  "sphere-education": "▤",
  "sphere-it": "</>",
  "sphere-services": "✦",
};

const iconVariants = cva("inline-flex shrink-0 items-center justify-center text-current", {
  variants: {
    size: {
      sm: "size-4 text-sm",
      md: "size-5 text-md",
      lg: "size-6 text-lg",
    },
  },
  defaultVariants: { size: "md" },
});

export type IconProps = VariantProps<typeof iconVariants> & {
  name: IconName;
  className?: string;
  title?: string;
  decorative?: boolean;
};

export function Icon({ name, size, className, title, decorative = false }: IconProps) {
  const { mode } = useUiMode();
  const label = title ?? ICON_LABELS[name];
  const classes = cn(iconVariants({ size }), className);
  const ultra = mode === "ultra";

  return (
    <span
      className={classes}
      aria-hidden={decorative ? true : undefined}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : label}
    >
      {ultra ? (
        ICON_GLYPHS[name]
      ) : (
        <svg className="size-full" focusable="false" aria-hidden="true">
          <use href={`/icons/sprite.svg#icon-${name}`} />
        </svg>
      )}
    </span>
  );
}
