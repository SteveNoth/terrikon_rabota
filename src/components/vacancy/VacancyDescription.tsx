import type { ReactNode } from "react";
import type { VacancyDescriptionSections } from "@/lib/vacancy/view";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h2 className="font-display text-xl font-medium">{title}</h2>
      {children}
    </section>
  );
}

function Paragraphs({ items }: { items: string[] }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {items.map((item) => (
        <p key={item.slice(0, 48)} className="min-w-0 break-words">
          {item}
        </p>
      ))}
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="flex min-w-0 list-disc flex-col gap-1 pl-5">
      {items.map((item) => (
        <li key={item.slice(0, 48)} className="min-w-0 break-words">
          {item}
        </li>
      ))}
    </ul>
  );
}

/**
 * Описание карточки. Принимает только поля вида, не rawText.
 * Есть разделы — рисуем «Описание / Задачи / Требования / Условия».
 * Нет — обычный текст с абзацами. HTML источника уже вычищен в VacancyView.
 */
export function VacancyDescription({
  descriptionSections,
  descriptionParagraphs,
}: {
  descriptionSections: VacancyDescriptionSections | null;
  descriptionParagraphs: string[];
}) {
  if (descriptionSections) {
    const { description, tasks, requirements, conditions } = descriptionSections;
    const hasAnything =
      Boolean(description) || tasks.length > 0 || requirements.length > 0 || conditions.length > 0;
    if (!hasAnything) {
      return null;
    }

    return (
      <div className="flex min-w-0 flex-col gap-5">
        {description ? (
          <Section title="Описание">
            <Paragraphs items={[description]} />
          </Section>
        ) : null}
        {tasks.length > 0 ? (
          <Section title="Задачи">
            <BulletList items={tasks} />
          </Section>
        ) : null}
        {requirements.length > 0 ? (
          <Section title="Требования">
            <BulletList items={requirements} />
          </Section>
        ) : null}
        {conditions.length > 0 ? (
          <Section title="Условия">
            <BulletList items={conditions} />
          </Section>
        ) : null}
      </div>
    );
  }

  if (descriptionParagraphs.length === 0) {
    return null;
  }

  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h2 className="font-display text-xl font-medium">Описание</h2>
      <Paragraphs items={descriptionParagraphs} />
    </section>
  );
}
