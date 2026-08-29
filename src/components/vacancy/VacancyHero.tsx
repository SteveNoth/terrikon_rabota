import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { SmartImage } from "@/components/ui/SmartImage";
import type { VacancyFact, VacancyVahtaView, VacancyView } from "@/lib/vacancy/view";

function FactRow({ label, value }: VacancyFact) {
  return (
    <p className="min-w-0 break-words text-md">
      <span className="text-muted">{label}: </span>
      {value}
    </p>
  );
}

function VahtaConditions({ vahta }: { vahta: VacancyVahtaView }) {
  const extras: VacancyFact[] = [];
  if (vahta.rotation) {
    extras.push({ label: "Схема смен", value: vahta.rotation });
  }
  if (vahta.duration) {
    extras.push({ label: "Длительность", value: vahta.duration });
  }
  if (vahta.housing) {
    extras.push({ label: "Проживание", value: "предоставляется" });
  }
  if (vahta.meals) {
    extras.push({ label: "Питание", value: "предоставляется" });
  }
  if (vahta.travel) {
    extras.push({ label: "Проезд", value: "оплачивается" });
  }
  if (vahta.advance) {
    extras.push({ label: "Аванс", value: "есть" });
  }
  if (vahta.whoHires) {
    extras.push({ label: "Кто набирает", value: vahta.whoHires });
  }

  if (extras.length === 0) {
    return null;
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      {extras.map((item) => (
        <FactRow key={item.label} label={item.label} value={item.value} />
      ))}
    </div>
  );
}

export function VacancyHero({ view }: { view: VacancyView }) {
  const localPlace = view.districtName
    ? `${view.cityName} · ${view.districtName}`
    : view.cityName;

  return (
    <header className="flex min-w-0 flex-col gap-3">
      <h1 className="font-display text-2xl font-medium leading-tight">{view.title}</h1>
      {view.summaryLine ? (
        <p className="min-w-0 break-words text-md text-muted">{view.summaryLine}</p>
      ) : null}
      <p className="font-display text-3xl font-medium leading-tight">{view.salary}</p>

      {view.employer ? (
        <p className="flex min-w-0 flex-wrap items-center gap-2 text-md">
          <SmartImage src={view.employer.logoUrl} name={view.employer.name} size="md" />
          <span className="min-w-0 break-words">{view.employer.name}</span>
          {view.employer.isVerified ? (
            <Badge tone="success" className="inline-flex items-center gap-1">
              <Icon name="check" size="sm" decorative />
              Проверено
            </Badge>
          ) : null}
        </p>
      ) : null}

      {view.vahta ? (
        <div className="flex min-w-0 flex-col gap-2">
          {view.vahta.workLocation ? (
            <p className="text-xl font-medium leading-tight">Работа: {view.vahta.workLocation}</p>
          ) : null}
          <p className="text-sm text-muted">Набор из {view.vahta.hiringFrom}</p>
          <VahtaConditions vahta={view.vahta} />
        </div>
      ) : (
        <p className="flex min-w-0 items-start gap-2 text-md">
          <Icon name="location" size="sm" decorative />
          <span className="min-w-0 break-words">{localPlace}</span>
        </p>
      )}

      {view.facts.length > 0 ? (
        <div className="flex min-w-0 flex-col gap-1">
          {view.facts.map((fact) => (
            <FactRow key={fact.label} label={fact.label} value={fact.value} />
          ))}
        </div>
      ) : null}

      <p className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-muted">
        <time dateTime={view.publishedIso}>{view.publishedLabel}</time>
        {view.freshnessLabel ? (
          <>
            <span aria-hidden="true">·</span>
            <span>{view.freshnessLabel}</span>
          </>
        ) : null}
      </p>
    </header>
  );
}