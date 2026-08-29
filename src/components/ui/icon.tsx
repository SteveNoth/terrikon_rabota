"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/format/cn";
import { useQuality } from "@/lib/quality/QualityProvider";
import { usesIconSprite } from "@/lib/quality/features";

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
  "telegram",
  "sphere-production",
  "sphere-construction",
  "sphere-trade",
  "sphere-transport",
  "sphere-medicine",
  "sphere-education",
  "sphere-it",
  "sphere-services",
  "sphere-food",
  "sphere-security",
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
  telegram: "Telegram",
  "sphere-production": "Производство",
  "sphere-construction": "Стройка",
  "sphere-trade": "Торговля",
  "sphere-transport": "Транспорт",
  "sphere-medicine": "Медицина",
  "sphere-education": "Образование",
  "sphere-it": "IT",
  "sphere-services": "Услуги",
  "sphere-food": "Общепит",
  "sphere-security": "Охрана",
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
  telegram: "✈",
  "sphere-production": "⚙",
  "sphere-construction": "⚒",
  "sphere-trade": "⇄",
  "sphere-transport": "⛟",
  "sphere-medicine": "✚",
  "sphere-education": "▤",
  "sphere-it": "</>",
  "sphere-services": "⌁",
  "sphere-food": "♨",
  "sphere-security": "⛨",
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
  const { features } = useQuality();
  const label = title ?? ICON_LABELS[name];
  const classes = cn(iconVariants({ size }), className);
  const sprite = usesIconSprite(features);

  return (
    <span
      className={classes}
      aria-hidden={decorative ? true : undefined}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : label}
    >
      {sprite ? (
        <svg className="size-full" focusable="false" aria-hidden="true">
          <use href={`/icons/sprite.svg?v=3#icon-${name}`} />
        </svg>
      ) : (
        ICON_GLYPHS[name]
      )}
    </span>
  );
}
