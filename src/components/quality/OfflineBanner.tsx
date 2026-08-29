/**
 * Заготовка баннера «нет сети».
 * Полноценно оживёт на Этапе 11: service worker, IndexedDB и очередь действий.
 */
export function OfflineBanner() {
  return (
    <div hidden data-offline-banner role="status" aria-live="polite">
      Нет сети. Показываем сохранённые вакансии.
    </div>
  );
}
