/** Потолок активных вакансий на один аккаунт работодателя. Защита от спама, не «тариф». */
export const MAX_ACTIVE_VACANCIES = 20;

export const MAX_ACTIVE_VACANCIES_MESSAGE =
  "Нельзя держать больше 20 активных вакансий на одном аккаунте. Снимите с публикации лишние — так мы защищаемся от спама.";

export const FOREIGN_VACANCY_MESSAGE = "Нельзя редактировать чужую вакансию.";

export const EMPLOYER_ONLY_MESSAGE = "Этот раздел только для работодателей.";

export const VERIFY_HINT =
  "Отметку «проверенный работодатель» ставит только администратор сайта. Заполните профиль компании, укажите настоящие контакты, разместите вакансии и напишите нам в Telegram-канал — проверим и поставим отметку. Сами себе галочку поставить нельзя.";

export const FIELD_CLASS =
  "block w-full min-h-tap rounded-md border border-border bg-surface px-3 py-2 text-md text-text " +
  "placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

export const FIELD_INVALID_CLASS = "border-danger";
