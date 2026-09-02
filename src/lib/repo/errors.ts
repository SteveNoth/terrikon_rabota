/**
 * Ошибка слоя данных. В ответ пользователю — короткая фраза на русском.
 * Подробности Prisma (в них бывает строка подключения) пишем только в журнал сервера.
 */
import { log } from "@/lib/log";

export function repoError(action: string, cause: unknown): Error {
  log.error("repo", action, cause);
  return new Error(`Не удалось ${action}. Попробуйте обновить страницу.`);
}
