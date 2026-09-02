import { Label } from "@/components/ui/label";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/format/cn";
import { FIELD_CLASS } from "@/lib/auth/constants";
import { citySelectOptions } from "@/lib/auth/schemas";
import { QUALITY_PREFERENCE_OPTIONS } from "@/lib/seeker/labels";
import { RESUME_MAX_CHARS, TELEGRAM_NOTIFY_LABEL } from "@/lib/seeker/constants";
import { telegramBotStartUrl } from "@/lib/site";
import { saveSeekerProfileAction } from "@/app/profile/actions";
import type { SeekerProfile } from "@/lib/repo/seeker";

export function ProfileForm({ profile }: { profile: SeekerProfile }) {
  const cities = citySelectOptions();
  const botHref = telegramBotStartUrl(profile.telegramLinkCode);

  return (
    <form action={saveSeekerProfileAction} className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor="seeker-name">Имя</Label>
        <input id="seeker-name" name="name" required defaultValue={profile.name} className={FIELD_CLASS} />
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor="seeker-email">Email</Label>
        <input id="seeker-email" value={profile.email} readOnly className={cn(FIELD_CLASS, "bg-surface-muted")} />
        <p className="text-sm text-muted">Почту входа здесь поменять нельзя.</p>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor="seeker-phone">Телефон</Label>
        <input id="seeker-phone" name="phone" defaultValue={profile.phone} className={FIELD_CLASS} />
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor="seeker-city">Город поиска</Label>
        <select id="seeker-city" name="citySlug" required defaultValue={profile.citySlug} className={FIELD_CLASS}>
          {cities.map((city) => (
            <option key={city.slug} value={city.slug}>
              {city.label}
            </option>
          ))}
        </select>
        <p className="text-sm text-muted">
          По умолчанию — активный город сайта. Можно выбрать другой: человек часто ищет работу не там, где живёт.
        </p>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor="seeker-resume">Резюме текстом</Label>
        <textarea
          id="seeker-resume"
          name="resumeText"
          rows={8}
          maxLength={RESUME_MAX_CHARS}
          defaultValue={profile.resumeText}
          className={FIELD_CLASS}
        />
        <p className="text-sm text-muted">До {RESUME_MAX_CHARS} символов. Этот текст подставится в отклик.</p>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor="seeker-resume-url">Ссылка на резюме</Label>
        <input
          id="seeker-resume-url"
          name="resumeUrl"
          type="url"
          inputMode="url"
          placeholder="https://"
          defaultValue={profile.resumeUrl}
          className={FIELD_CLASS}
        />
        <p className="text-sm text-muted">Файлы не храним — только ссылка, например на hh или Google Документы.</p>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor="seeker-mode">Режим качества</Label>
        <select
          id="seeker-mode"
          name="preferredMode"
          defaultValue={profile.preferredMode}
          className={FIELD_CLASS}
        >
          {QUALITY_PREFERENCE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <p className="text-sm text-muted">Запоминается в аккаунте и в cookie, чтобы на другом устройстве открылось так же.</p>
      </div>
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="text-sm font-medium">Уведомления</legend>
        <label className="inline-flex min-h-tap cursor-pointer items-start gap-2 text-md">
          <input
            type="checkbox"
            name="notifyTelegram"
            value="on"
            defaultChecked={profile.notifyTelegram}
            className="mt-1 size-4 shrink-0 rounded-sm border border-border accent-brand"
          />
          <span>{TELEGRAM_NOTIFY_LABEL}</span>
        </label>
        <div className="flex min-w-0 flex-col gap-1 text-sm text-muted">
            <p>
              Код привязки: <span className="font-medium text-text">{profile.telegramLinkCode}</span>
            </p>
            {botHref ? (
              <p>
                <a href={botHref} className="text-brand underline-offset-2 hover:underline" rel="noopener noreferrer">
                  Открыть бота с кодом привязки
                </a>
              </p>
            ) : (
              <p>
                Ссылка на бота появится, когда он будет запущен. Код уже в профиле — его не нужно переписывать на бумажку.
              </p>
            )}
          </div>
      </fieldset>
      <button type="submit" className={cn(buttonVariants({ variant: "primary" }), "self-start")}>
        Сохранить
      </button>
    </form>
  );
}
