const STEPS = [
  {
    n: "1",
    title: "Найдите вакансию",
    text: "Введите должность в поиск, выберите профессию или откройте сферу. Форма работает и без JavaScript.",
  },
  {
    n: "2",
    title: "Сравните условия",
    text: "На карточке сразу видны зарплата, график, район и отметка «Проверено», если работодателя подтвердили.",
  },
  {
    n: "3",
    title: "Свяжитесь напрямую",
    text: "Контакты в объявлении открываются как обычная ссылка. За доступ к вакансиям мы не берём денег.",
  },
] as const;

export function HomeHowItWorks() {
  return (
    <section className="mx-auto flex w-full max-w-container min-w-0 flex-col gap-4 px-4 py-6">
      <h2 className="font-display text-xl font-medium">Как это работает</h2>
      <ol className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-3">
        {STEPS.map((step) => (
          <li
            key={step.n}
            className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-surface p-4"
          >
            <p className="text-sm font-medium text-muted">Шаг {step.n}</p>
            <h3 className="font-medium text-lg">{step.title}</h3>
            <p className="text-sm text-muted">{step.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
