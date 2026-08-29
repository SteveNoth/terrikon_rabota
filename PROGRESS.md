# PROGRESS — Террикон Работа

Последнее обновление: 2026-08-29

## Где я сейчас
- Текущий этап: 10
- Последний завершённый этап: 10
- Последний коммит: Этап 9 — карточка вакансии (ветка `stage-09-job-card`)
- Ветка этапа: `stage-10-ultra-lite`

## Что уже работает
- Установлены Node.js, Python, Git, Cursor
- Созданы аккаунты GitHub, Supabase, Vercel, Telegram
- Репозиторий terrikon_rabota на GitHub (логин: SteveNoth), привязан локально
- Скелет Next.js: TypeScript, ESLint, Tailwind CSS v4, `src/`, App Router, Turbopack
- Дизайн-система: токены в `src/styles/tokens.css`, режимы в `src/styles/modes.css`, кирпичики в `src/components/ui/`
- Живой стайлгайд: http://localhost:3000/dev/ui (только в разработке)
- `npm run check:design` проходит и ловит HEX вне токенов
- География из `shared/geo.json`: Горловка активна, Донецк/Макеевка/Енакиево/Харцызск — soon, остальные — planned
- Адреса `/gorlovka`, `/gorlovka/jobs`; `/` уводит на город по cookie `tr_city` или город по умолчанию
- `/donetsk` показывает заглушку с падежами; `/lugansk` — 404 со списком доступных городов
- Селектор города — форма GET (без JavaScript) и мгновенный переход с JavaScript
- Шапка, футер, нижнее меню; слот под кнопку поддержки проекта пока пустой
- Prisma 6.19.3: схема по разделу 10, миграция `init` накатана на Supabase, сиды 12 местных + 3 вахты, клиент `src/lib/adapters/db.ts`
- Слой данных `src/lib/repo/`: страницы просят функции, а не пишут Prisma-запросы. Список вакансий без `description`, всегда `take`. Вахты по умолчанию не смешиваются с местными (Закон 17)
- Адаптеры: кэш (память, задел под Redis), storage / search / notify / maps — шов по переменным окружения
- `/api/vacancies`: Горловка — 12 вакансий; Донецк — `cityInDevelopment: true`; несуществующий город — 404; кривые `page`/`sort` не ломают ответ
- `/api/ping` — 204; `/api/ping?size=8kb` — ровно 8192 байта несжимаемых данных
- Форматтеры: деньги, даты, телефон, склонения
- Режимы качества Full / Lite / Ultra: решение на сервере до HTML (`?mode=`, cookie `tr_mode` / `tr_res`, `Save-Data`, env). Матрица `FEATURES` — единственное место «что включено». Переключатель работает без JavaScript. Понижение сразу, повышение при следующем переходе.
- Главная города `/gorlovka`: hero с падежом `loc` из geo, поиск GET без JavaScript (`/?city=&q=` → `/[city]/jobs?q=`), теги профессий из `shared/professions.json` по популярности в городе, 6 карточек из базы, 8 сфер со счётчиком из кэша, «Как это работает», планы `soon`/`planned` на `/about#plans`
- Карточка `src/components/vacancy/VacancyCard.tsx`: ссылка на `/[city]/job/[slug]`. Полнота по `features.descriptionPreview` / `features.images` (Full — 2 строки сводки; Lite — без сводки; Ultra — название, место, зарплата, дата)
- Страница `/[city]/job/[slug]`: первый экран (название, зарплата, работодатель, место, факты, дата/свежесть). Вахта: «Работа: …» крупнее «Набор из …», затем схема смен и условия. Контакты выше описания (`tel:`, `https://t.me/`, `mailto:`), телефон с CSS-защитой от простого копирования. Описание из `VacancyView`: разделы или абзацы, HTML источника всегда вычищен. Источник + «Открыть оригинал» + при автообработке `<details>Показать оригинал</details>`. Нет данных — нет строки. «Что уточнить у работодателя» из `missingInfo`. «О работодателе». Кнопки: отклик → `/login`, избранное локально, поделиться, жалоба → `Report`. Похожие — 3 той же сферы и города. Карта: Full/Lite кнопка (ресурс по клику), Ultra — адрес + `geo:`. Событие `VACANCY_VIEW` без задержки страницы
- `src/lib/vacancy/view.ts` — контракт `VacancyView`. Компонент описания не получает `rawText`
- `/api/events` — `sendBeacon` в Full/Lite. Ultra пишет просмотр через `after()`. Cookie сессии `tr_sid` на 24 часа. Без IP и строки браузера. Не чаще раза в 30 минут на пару сессия+вакансия
- `/api/reports` — форма жалобы без JavaScript, в причинах «Похоже на мошенничество», ссылка на `/safety`. Сайт не называет объявление мошенническим
- `/login` — заглушка: смотреть можно без аккаунта, отклик позже
- ISR: `export const revalidate = 600` на главной. Из-за заголовка режима страница в сборке остаётся динамической; свежие вакансии, счётчики сфер и популярные профессии кэшируются адаптером на 10 минут
- Замер первой загрузки Full/Lite (gzip, production `next start`, скрипт `node scripts/measure-home.mjs`): HTML ~9–10 КБ, CSS ~6 КБ, шрифт 0, спрайт только Full/Lite. JS ~192 КБ — каркас Next.js (бюджеты 8.5 для Lite этим каркасом всё ещё не закрыты)
- Ultra Lite — отдельный тонкий путь: middleware при режиме `ultra` переписывает запрос на `/u/...`, адрес в браузере не меняется (`x-ultra-path`). HTML собирается строками в `src/ultra/`, без React и без `<script>`. Прямой заход на `/u/...` вне ultra уводит на публичный адрес
- Тонкие страницы: главная города, `/[city]/jobs` и `/[city]/vahta` (GET-фильтры, сортировка ссылками, нумерованная пагинация, `?filters=1`), карточка (`toVacancyView`, оригинал в `<details>Показать оригинал</details>`, телефон CSS-обфускацией, `geo:` вместо карты, просмотр через `after()`), заглушка soon + POST `intent=notify-city`, `/about`, `/about/lite`, `/safety`, `/login`, ошибки. Данные — те же `src/lib/repo`
- Критический CSS Ultra: подмножество тех же `--t-*` из `src/styles/tokens.css` + оверлеи из `modes.css`, ~8 КБ несжатых, встроен в HTML. Второй палитры нет
- Переключение версий: в Ultra футер/низ «Полная версия» / «Полная» → `?mode=full`; в Full/Lite футер «Экономная версия» → `?mode=ultra` и ссылка на `/about/lite`
- `Cache-Control`: главная/about/списки — `private, max-age=60, stale-while-revalidate=300`; карточка/логин/ошибки — `private, no-store`. `Vary: Cookie, Save-Data`
- Замер Ultra (gzip, `npm run measure:ultra`): `/gorlovka?mode=ultra` HTML 5.04 КБ, CSS 7.99 КБ, JS 0, 1 запрос, до первой карточки на 50 Кбит/с + 1.2 с RTT ≈ **1.78 с**; список `/gorlovka/jobs?mode=ultra` HTML 5.83 КБ, то же CSS/JS, ≈ **1.75 с**. Бюджеты 8.5 Ultra (≤ 40 КБ, HTML ≤ 25, CSS ≤ 8, JS 0, ≤ 3 запроса) закрыты
- Список `/[city]/jobs`: только `workFormat=LOCAL` (Закон 17 / 11.16). Вкладка «Вахта · N» рядом с заголовком ведёт на `/[city]/vahta`. В общем списке вахт нет
- `/[city]/vahta`: отдельная посадочная («вахта из Горловки»), свои фильтры (место работы из geo, смена, ротация, проживание, питание, проезд, напрямую от работодателя), предупреждение и ссылка на `/safety`. В карточке «Работа: …» раньше и заметнее «Набор: город»
- `/safety` «Как не попасться при поиске работы»: региональные примеры; ссылки из раздела вахт, карточки и футера
- Фильтры — одна форма `method="GET"`. Состояние только в адресе. На телефоне `?filters=1` — отдельный экран; на десктопе колонка слева. Cookie `tr_search` помнит последний поиск (не подменяет адрес)
- Счётчик считает единицы выдачи через `listingUnitWhere()` (раздел 11.17): позже группа дублей = одна вакансия; пока групп нет, условие совпадает со всеми опубликованными
- Пагинация: Full/Lite — «Показать ещё» как `<a href="?page=N">` (JS докидывает и `replaceState`); Ultra и без JS — нумерованные ссылки, 10 на страницу. Поисковику нужен href, а не кнопка из скрипта
- Донецк (`soon`): `CityDevelopmentPlaceholder` вместо списка, фильтры остаются
- Пустой результат: `EmptyState` + сброс + переход в вахту/местные, если там есть объявления
- Производительность списка: один `findMany` (take/skip) + отдельный `count` по тому же where. План: `node scripts/bench-vacancies.mjs` — индекс `Vacancy_citySlug_isActive_workFormat_publishedAt_idx`. На 12 строках list+count ~0.2 мс; на 5000 — list ~0.1 мс, count ~4 мс, затем cleanup `bench-*`. HTTP с дома до Франкфурта — дорога, не SQL
- `npm run build` проходит
- Живой сайт: https://terrikon-rabota.vercel.app — 2026-08-29 повторно выложен через Vercel CLI (не через GitHub). На сайте уже список и карточки, не заглушка Этапа 1
- База Supabase: проект `terrikon-rabota`, регион Frankfurt (`eu-central-1`)
- Серверные функции Vercel: регион `fra1` (`vercel.json`), рядом с базой

## Технические факты проекта (ИИ, читай это!)
- Node.js: v24.20.0
- Next.js: 16.3.3
- Tailwind CSS: 4.3.3 (мажорная версия **4** — связка токенов через `@theme` в CSS, не через `tailwind.config.ts`)
- React: 19.2.8
- class-variance-authority: 0.7.1
- clsx: 2.1.1
- tailwind-merge: 3.6.0
- Prisma: 6.19.3 (не 7: URL в schema.prisma, клиент `@prisma/client`)
- zod: 3.25.76
- Пакетный менеджер: npm (v11.19.0)
- Python: 3.14.6
- Git: 2.55.0.windows.5
- ОС: Windows 10, оболочка PowerShell
- Имя репозитория GitHub: terrikon_rabota
- URL репозитория: https://github.com/SteveNoth/terrikon_rabota
- URL сайта на Vercel: https://terrikon-rabota.vercel.app
- Команда Vercel: terrikon
- Проект Vercel: terrikon-rabota
- Проект Supabase: terrikon-rabota (ref ptbtyfvszliqagnvpocf, регион eu-central-1)
- Регион Vercel: `fra1` (Франкфурт)
- Cookie города: `tr_city`
- Cookie последнего поиска: `tr_search` (`v1|city|jobs|query`), 30 дней, httpOnly, пишет middleware при фильтрах на `/[city]/jobs` и `/[city]/vahta`; `?reset=1` чистит cookie и редиректит на чистый список
- Cookie выбора режима: `tr_mode` (`auto` / `full` / `lite` / `ultra`), httpOnly, ставит middleware при `?mode=`
- Заголовок тонкого пути: `x-ultra-path` (`ULTRA_PATH_HEADER`) — публичный путь при внутреннем rewrite на `/u/...`
- Замер Ultra: `npm run measure:ultra` (`scripts/measure-ultra.mjs`); дым: `node scripts/ultra-smoke.mjs`
- Cookie сессии аналитики: `tr_sid` (32 hex), 24 часа, httpOnly. Middleware кладёт то же значение в заголовок `x-session-hash`, чтобы Ultra успел записать событие в `after()` на первом заходе
- Cookie замера: `tr_res` (`full` / `lite` / `ultra`), 7 дней, пишет клиент при `tr_mode=auto`
- Заголовки запроса после middleware: `x-quality-mode`, `x-quality-preference`, `x-session-hash`, при ultra ещё `x-ultra-path`
- Источник городов: `shared/geo.json` (читают и TypeScript, и Python)
- Источник профессий: `shared/professions.json` (имена и сферы; популярность на главной — из базы)
- Prisma seed: `npx prisma db seed` (tsx prisma/seed.ts)
- Кэш списков выдачи: нет (адрес — источник правды). На главной кэшируются свежие 6 карточек, счётчики сфер/профессий и справочники — 10 минут. Счётчики «местные / вахта» на вкладках — 10 минут
- Бюджет `/api/vacancies`: ≤ 400 мс при 12 и ≤ 600 мс при 5000, когда функция и база в одном регионе (`fra1`). С домашнего ПК до Франкфурта Prisma RTT ~1.5–2 с, HTTP `/api/vacancies` ~2.7–3.5 с — это дорога. Сам SQL: `node scripts/bench-vacancies.mjs` (EXPLAIN ANALYZE + `--load` на 5000 с автоочисткой)
- Как смотреть план: `node scripts/bench-vacancies.mjs` или в SQL Editor Supabase `EXPLAIN (ANALYZE, BUFFERS)` того же SELECT. В плане должен быть `Vacancy_citySlug_isActive_workFormat_publishedAt_idx` — он режет вахты и местные (Закон 17)

## Решения, которые нельзя менять
- Стек выбран бесплатный (см. docs/DECISIONS.md)
- Tailwind CSS v4 (установлен create-next-app; Этап 2 делать в варианте для v4, не для v3)
- Города не пишутся строкой в `src/` — только через `shared/geo.json` (Закон 3)
- Prisma 6.x, не 7 (см. docs/DECISIONS.md)
- Серверные функции Vercel живут в `fra1`, рядом с Supabase (см. docs/DECISIONS.md)

## Открытые вопросы / долги
- GitHub ещё не подключён к проекту Vercel: `git push` пока сам сайт не обновляет. 2026-08-29 сайт обновили через CLI; шаги привязки репозитория — в docs/SETUP-LOG.md. После связи регион `fra1` из `vercel.json` применится сам.
- Next.js 16 предупреждает, что `middleware.ts` устарел в пользу `proxy.ts`. Файл оставлен как `src/middleware.ts`, потому что так написано в ядре и на следующих этапах его дополняем.
- Бюджеты 8.5 для **Lite** по JS/запросам/итогу пока не закрыты каркасом Next.js (~192 КБ на Full/Lite). Ultra закрыт тонким путём Этапа 10.
- «Показать ещё» на сидах не видно: 12 местных при Full/Lite по 20 на страницу — одна страница. На Ultra (10 на страницу) есть `?page=2`. Проверка докидывания — после большего набора или с `?pageSize=` через API.
