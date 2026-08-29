"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  COLOR_THEMES,
  QUALITY_MODES,
  useUiMode,
  type ColorTheme,
  type QualityMode,
} from "@/components/ui/mode-provider";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { SmartImage } from "@/components/ui/SmartImage";
import { TerriconLogo } from "@/components/brand/TerriconLogo";
import { FEATURES } from "@/lib/quality/features";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Chip } from "@/components/ui/chip";
import { Divider } from "@/components/ui/divider";
import { EmptyState } from "@/components/ui/empty-state";
import { FieldError } from "@/components/ui/field-error";
import { Icon, ICON_LABELS, ICON_NAMES } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

const MODE_LABELS: Record<QualityMode, string> = {
  full: "Full",
  lite: "Lite",
  ultra: "Ultra",
};

const THEME_LABELS: Record<ColorTheme, string> = {
  light: "Светлая",
  dark: "Тёмная",
};

const MODE_LEVERS: Record<
  QualityMode,
  { radius: number; shadow: number; space: number; font: number }
> = {
  full: { radius: 10, shadow: 1, space: 4, font: 16 },
  lite: { radius: 8, shadow: 0.35, space: 4, font: 16 },
  ultra: { radius: 6, shadow: 0, space: 4, font: 16 },
};

const BUTTON_VARIANTS = ["primary", "accent", "outline", "ghost", "danger"] as const;
const BUTTON_SIZES = ["sm", "md", "lg"] as const;
const BADGE_TONES = ["neutral", "brand", "accent", "success", "warning", "danger", "info"] as const;
const CHIP_VARIANTS = ["default", "outline", "accent", "active"] as const;
const CARD_VARIANTS = ["default", "muted", "outline", "inverse", "interactive"] as const;
const ALERT_TONES = ["info", "success", "warning", "danger"] as const;
const SKELETON_SHAPES = ["line", "title", "circle", "block"] as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-medium">{title}</h2>
      {children}
    </section>
  );
}

function Swatch({ className, label }: { className: string; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`size-6 rounded-md border border-border ${className}`} />
      <span className="text-sm text-muted">{label}</span>
    </div>
  );
}

export function UiGuide() {
  const { mode, theme, setMode, setTheme } = useUiMode();
  const start = MODE_LEVERS[mode];
  const [radius, setRadius] = useState(start.radius);
  const [shadow, setShadow] = useState(start.shadow);
  const [space, setSpace] = useState(start.space);
  const [font, setFont] = useState(start.font);
  const [chipOn, setChipOn] = useState(true);
  const [agree, setAgree] = useState(false);

  function applyMode(next: QualityMode) {
    setMode(next);
    const levers = MODE_LEVERS[next];
    setRadius(levers.radius);
    setShadow(levers.shadow);
    setSpace(levers.space);
    setFont(levers.font);
  }

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--t-radius-base", `${radius}px`);
    root.style.setProperty("--t-shadow-strength", String(shadow));
    root.style.setProperty("--t-space-unit", `${space}px`);
    root.style.setProperty("--t-font-size-base", `${font}px`);

    return () => {
      root.style.removeProperty("--t-radius-base");
      root.style.removeProperty("--t-shadow-strength");
      root.style.removeProperty("--t-space-unit");
      root.style.removeProperty("--t-font-size-base");
    };
  }, [radius, shadow, space, font]);

  return (
    <div className="min-h-full bg-bg text-text">
      <header className="sticky top-0 z-10 border-b border-border bg-surface shadow-2">
        <div className="mx-auto flex max-w-container flex-col gap-4 p-4">
          <div>
            <p className="text-sm text-muted">Только для разработки — /dev/ui</p>
            <h1 className="font-display text-2xl">Стайлгайд</h1>
          </div>

          <div className="flex flex-wrap gap-2" role="group" aria-label="Режим оформления">
            {QUALITY_MODES.map((item) => (
              <Button
                key={item}
                variant={mode === item ? "primary" : "outline"}
                size="sm"
                aria-pressed={mode === item}
                onClick={() => applyMode(item)}
              >
                {MODE_LABELS[item]}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2" role="group" aria-label="Тема">
            {COLOR_THEMES.map((item) => (
              <Button
                key={item}
                variant={theme === item ? "primary" : "outline"}
                size="sm"
                aria-pressed={theme === item}
                onClick={() => setTheme(item)}
              >
                {THEME_LABELS[item]}
              </Button>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex min-h-tap flex-col gap-1 text-sm">
              Скругление --t-radius-base ({radius}px)
              <input
                type="range"
                min={0}
                max={24}
                step={1}
                value={radius}
                aria-label="Скругление базовое"
                className="accent-brand"
                onChange={(event) => setRadius(Number(event.target.value))}
              />
            </label>
            <label className="flex min-h-tap flex-col gap-1 text-sm">
              Сила теней --t-shadow-strength ({shadow})
              <input
                type="range"
                min={0}
                max={2}
                step={0.05}
                value={shadow}
                aria-label="Сила теней"
                className="accent-brand"
                onChange={(event) => setShadow(Number(event.target.value))}
              />
            </label>
            <label className="flex min-h-tap flex-col gap-1 text-sm">
              Шаг отступов --t-space-unit ({space}px)
              <input
                type="range"
                min={2}
                max={8}
                step={1}
                value={space}
                aria-label="Шаг отступов"
                className="accent-brand"
                onChange={(event) => setSpace(Number(event.target.value))}
              />
            </label>
            <label className="flex min-h-tap flex-col gap-1 text-sm">
              База шрифта --t-font-size-base ({font}px)
              <input
                type="range"
                min={12}
                max={22}
                step={1}
                value={font}
                aria-label="Базовый размер шрифта"
                className="accent-brand"
                onChange={(event) => setFont(Number(event.target.value))}
              />
            </label>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-container flex-col gap-8 p-4 pb-8">
        <Section title="Смысловые цвета">
          <div className="grid gap-3 sm:grid-cols-2">
            <Swatch className="bg-bg" label="bg-bg" />
            <Swatch className="bg-surface" label="bg-surface" />
            <Swatch className="bg-surface-muted" label="bg-surface-muted" />
            <Swatch className="bg-brand" label="bg-brand" />
            <Swatch className="bg-accent" label="bg-accent" />
            <Swatch className="bg-success" label="bg-success" />
            <Swatch className="bg-danger" label="bg-danger" />
            <Swatch className="bg-warning" label="bg-warning" />
            <Swatch className="bg-info" label="bg-info" />
            <Swatch className="bg-focus" label="bg-focus" />
          </div>
          <p className="text-md">
            Основной текст. <span className="text-muted">Приглушённый текст.</span>
          </p>
          <p className="rounded-md border border-border p-3 shadow-1">рамка и тень-1</p>
          <p className="rounded-lg border border-border-strong p-3 shadow-2">скругление-lg и тень-2</p>
          <p className="rounded-pill border border-border p-3 shadow-3">таблетка и тень-3</p>
          <p className="text-xs">text-xs</p>
          <p className="text-sm">text-sm</p>
          <p className="text-md">text-md</p>
          <p className="text-lg">text-lg</p>
          <p className="text-xl">text-xl</p>
          <p className="text-2xl">text-2xl</p>
          <p className="text-3xl">text-3xl</p>
        </Section>

        <Divider />

        <Section title="Button">
          <div className="flex flex-col gap-3">
            {BUTTON_VARIANTS.map((variant) => (
              <div key={variant} className="flex flex-wrap items-center gap-2">
                {BUTTON_SIZES.map((size) => (
                  <Button key={`${variant}-${size}`} variant={variant} size={size}>
                    {variant} {size}
                  </Button>
                ))}
                <Button variant={variant} disabled>
                  disabled
                </Button>
              </div>
            ))}
            <Button variant="primary" full>
              На всю ширину
            </Button>
          </div>
        </Section>

        <Section title="IconButton">
          <div className="flex flex-wrap gap-2">
            <IconButton name="search" aria-label="Поиск" variant="primary" />
            <IconButton name="filter" aria-label="Фильтр" variant="outline" />
            <IconButton name="close" aria-label="Закрыть" variant="ghost" />
            <IconButton name="star" aria-label="В избранное" variant="accent" />
            <IconButton name="menu" aria-label="Меню" variant="danger" />
            <IconButton name="profile" aria-label="Профиль" disabled />
          </div>
        </Section>

        <Section title="Card">
          <div className="grid gap-3 md:grid-cols-2">
            {CARD_VARIANTS.map((variant) => (
              <Card key={variant} variant={variant}>
                <p className="text-lg font-medium">Карточка {variant}</p>
                <p className="text-sm text-muted">Текст на поверхности.</p>
              </Card>
            ))}
          </div>
        </Section>

        <Section title="Badge">
          <div className="flex flex-wrap gap-2">
            {BADGE_TONES.map((tone) => (
              <Badge key={tone} tone={tone}>
                {tone}
              </Badge>
            ))}
          </div>
        </Section>

        <Section title="Chip">
          <div className="flex flex-wrap gap-2">
            {CHIP_VARIANTS.map((variant) => (
              <Chip key={variant} variant={variant}>
                {variant}
              </Chip>
            ))}
            <Chip pressed={chipOn} onClick={() => setChipOn((value) => !value)}>
              Фильтр {chipOn ? "включён" : "выключен"}
            </Chip>
          </div>
        </Section>

        <Section title="Поля формы">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor="guide-name">Имя</Label>
              <Input id="guide-name" name="name" placeholder="Как к вам обращаться" />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="guide-name-error" tone="danger">
                Имя с ошибкой
              </Label>
              <Input
                id="guide-name-error"
                name="name-error"
                invalid
                defaultValue=" "
                aria-invalid="true"
                aria-describedby="guide-name-error-text"
              />
              <FieldError id="guide-name-error-text">Укажите имя — так мы поймём, кому писать.</FieldError>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="guide-about">О себе</Label>
              <Textarea id="guide-about" name="about" rows={4} placeholder="Коротко о себе" />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="guide-city">Вариант</Label>
              <Select id="guide-city" name="option" defaultValue="one">
                <option value="one">Первый вариант</option>
                <option value="two">Второй вариант</option>
                <option value="three">Третий вариант</option>
              </Select>
            </div>
            <Checkbox
              id="guide-agree"
              name="agree"
              label="Согласен получать только нужные письма"
              checked={agree}
              onChange={(event) => setAgree(event.target.checked)}
            />
            <Label tone="muted">Подпись может жить отдельно от поля</Label>
          </div>
        </Section>

        <Section title="Alert">
          <div className="flex flex-col gap-3">
            {ALERT_TONES.map((tone) => (
              <Alert key={tone} tone={tone}>
                Сообщение {tone}: проверка токенов статуса.
              </Alert>
            ))}
          </div>
        </Section>

        <Section title="Skeleton и Spinner">
          <div className="flex flex-col gap-3">
            {SKELETON_SHAPES.map((shape) => (
              <Skeleton key={shape} shape={shape} />
            ))}
            <div className="flex items-center gap-3">
              <Spinner size="sm" />
              <Spinner size="md" />
              <Spinner size="lg" label="Идёт загрузка" />
            </div>
          </div>
        </Section>

        <Section title="Divider">
          <p>Над линией</p>
          <Divider />
          <p>Под линией</p>
          <div className="flex items-center gap-3">
            <span>слева</span>
            <Divider orientation="vertical" tone="strong" />
            <span>справа</span>
          </div>
        </Section>

        <Section title="Avatar">
          <div className="flex flex-wrap items-center gap-3">
            <Avatar name="Анна Смирнова" size="sm" />
            <Avatar name="Иван Коваль" size="md" />
            <Avatar name="Пётр" size="lg" />
            <Avatar name="Мария Лебедева" />
          </div>
        </Section>


        <Section title="SmartImage">
          <p className="text-sm text-muted">
            Full — картинка. Lite — маленькое превью. Ultra — буквы, без тега img.
            Сломанная ссылка тоже даёт аватар, не «битую картинку».
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <TerriconLogo />
            <SmartImage
              name="ООО Горловский механический завод"
              src="https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Example.svg/40px-Example.svg.png"
              images={FEATURES[mode].images}
              size="lg"
            />
            <SmartImage
              name="Сломанный логотип"
              src="https://upload.wikimedia.org/wikipedia/commons/missing-employer-logo.png"
              images={FEATURES[mode].images}
              size="md"
            />
            <SmartImage name="Без ссылки" images={FEATURES[mode].images} size="md" />
          </div>
        </Section>

        <Section title="EmptyState">
          <Card>
            <EmptyState
              icon="search"
              title="Пока ничего нет"
              description="Измените фильтры или загляните позже."
              action={<Button variant="outline">Сбросить фильтры</Button>}
            />
          </Card>
        </Section>

        <Section title="Pagination">
          <Pagination
            page={2}
            pageCount={5}
            prevHref="#p-1"
            nextHref="#p-3"
            pages={[1, 2, 3, 4, 5].map((item) => ({
              page: item,
              href: `#p-${item}`,
              current: item === 2,
            }))}
          />
        </Section>

        <Section title="Icon">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {ICON_NAMES.map((name) => (
              <div key={name} className="flex min-h-tap items-center gap-2 text-sm">
                <Icon name={name} />
                <span>{ICON_LABELS[name]}</span>
              </div>
            ))}
          </div>
        </Section>
      </main>
    </div>
  );
}
