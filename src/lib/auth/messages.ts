/**
 * Тексты ошибок входа — только по-русски.
 * Supabase отвечает по-английски; страница этого языка не показывает.
 */

const BY_CODE: Record<string, string> = {
  user_already_exists: "Такой email уже зарегистрирован",
  email_exists: "Такой email уже зарегистрирован",
  identity_already_exists: "Такой email уже зарегистрирован",
  invalid_credentials: "Неверный email или пароль",
  invalid_login_credentials: "Неверный email или пароль",
  email_not_confirmed: "Подтвердите почту — мы отправили письмо со ссылкой",
  email_address_not_authorized: "Этот адрес почты сейчас нельзя использовать",
  email_address_invalid: "Некорректный email",
  user_banned: "Этот аккаунт заблокирован",
  user_not_found: "Неверный email или пароль",
  over_email_send_rate_limit: "Слишком частые запросы. Подождите минуту и попробуйте снова",
  over_request_rate_limit: "Слишком частые запросы. Подождите минуту и попробуйте снова",
  request_timeout: "Сервис входа не ответил. Попробуйте ещё раз",
  session_not_found: "Сессия истекла. Войдите снова",
  refresh_token_not_found: "Сессия истекла. Войдите снова",
  weak_password: "Пароль слишком простой. Придумайте другой, не короче 8 символов",
  same_password: "Новый пароль должен отличаться от старого",
  otp_expired: "Ссылка устарела. Запросите письмо ещё раз",
  otp_disabled: "Подтверждение по ссылке сейчас недоступно",
  access_denied: "Доступ запрещён",
  unexpected_failure: "Не получилось выполнить запрос. Попробуйте ещё раз",
  signup_disabled: "Регистрация временно закрыта",
  email_provider_disabled: "Вход по почте сейчас выключен",
};

const BY_TEXT: { test: RegExp; message: string }[] = [
  { test: /already registered|already exists|already been registered/i, message: "Такой email уже зарегистрирован" },
  { test: /invalid login credentials|invalid credentials|invalid email or password/i, message: "Неверный email или пароль" },
  { test: /email not confirmed/i, message: "Подтвердите почту — мы отправили письмо со ссылкой" },
  { test: /invalid format|valid email|email address/i, message: "Некорректный email" },
  { test: /password should be at least|weak password|too short/i, message: "Пароль слишком короткий. Минимум 8 символов" },
  { test: /for security purposes|rate limit|too many requests|after \d/i, message: "Слишком частые запросы. Подождите минуту и попробуйте снова" },
  { test: /expired|invalid reset|otp|magic link/i, message: "Ссылка устарела. Запросите письмо ещё раз" },
  { test: /same password/i, message: "Новый пароль должен отличаться от старого" },
  { test: /signup is disabled/i, message: "Регистрация временно закрыта" },
  { test: /invalid path specified|pgrst125/i, message: "Сервис входа не принял адрес проекта. Нужен Project URL, не REST /rest/v1" },
  { test: /error sending|confirmation email|smtp|gomail|mailer/i, message: "Не получилось отправить письмо подтверждения. Подождите минуту и попробуйте снова" },
  { test: /database error saving new user/i, message: "Не получилось создать аккаунт. Если ошибка повторяется — напишите администратору" },
  { test: /leaked|pwned|compromised password|known to be weak/i, message: "Этот пароль слишком известный. Придумайте другой" },
  { test: /redirect[_ ]url|unsupported redirect|redirect.*not allowed/i, message: "Адрес возврата после письма не разрешён. Добавьте localhost и адрес сайта в Redirect URLs кабинета входа" },
  { test: /unable to validate email/i, message: "Некорректный email" },
  { test: /user not found/i, message: "Неверный email или пароль" },
  { test: /network|fetch/i, message: "Нет связи с сервисом входа. Проверьте интернет и попробуйте снова" },
];

export function authErrorMessage(
  error: { message?: string; code?: string; status?: number } | string | null | undefined,
  fallback = "Не получилось выполнить запрос. Попробуйте ещё раз",
): string {
  if (!error) {
    return fallback;
  }
  if (typeof error === "string") {
    return mapText(error, fallback);
  }
  const code = error.code?.trim().toLowerCase();
  if (code && BY_CODE[code] && code !== "unexpected_failure") {
    return BY_CODE[code];
  }
  if (error.status === 400 || error.status === 401) {
    const fromText = mapText(error.message ?? "", "");
    if (fromText) {
      return fromText;
    }
    return "Неверный email или пароль";
  }
  return mapText(error.message ?? "", fallback);
}

function mapText(raw: string, fallback = "Не получилось выполнить запрос. Попробуйте ещё раз"): string {
  const text = raw.trim();
  if (!text) {
    return fallback;
  }
  for (const row of BY_TEXT) {
    if (row.test.test(text)) {
      return row.message;
    }
  }
  if (/^[а-яё]/i.test(text)) {
    return text;
  }
  return fallback;
}

export const AUTH_NOT_CONFIGURED = "Вход на сайте ещё не настроен. Напишите администратору.";
