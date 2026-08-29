/**
 * Ошибка слоя данных. В ответ пользователю — короткая фраза на русском.
 * Подробности Prisma (в них бывает строка подключения) пишем только в журнал сервера.
 */
export function repoError(action: string, cause: unknown): Error {
  console.error(`[repo] ${action}`, cause);
  return new Error(`Не удалось ${action}. Попробуйте обновить страницу.`);
}
