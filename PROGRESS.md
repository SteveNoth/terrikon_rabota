# PROGRESS — Террикон Работа

Последнее обновление: 2026-08-28

## Где я сейчас
- Текущий этап: 3
- Последний завершённый этап: 3
- Последний коммит: этапы 2 и 3 на ветке `stage-02-design-system`
- Ветка этапа: `stage-02-design-system`

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
- `npm run build` проходит
- Живой сайт: https://terrikon-rabota.vercel.app

## Технические факты проекта (ИИ, читай это!)
- Node.js: v24.20.0
- Next.js: 16.3.3
- Tailwind CSS: 4.3.3 (мажорная версия **4** — связка токенов через `@theme` в CSS, не через `tailwind.config.ts`)
- React: 19.2.8
- class-variance-authority: 0.7.1
- clsx: 2.1.1
- tailwind-merge: 3.6.0
- Prisma: —
- Пакетный менеджер: npm (v11.19.0)
- Python: 3.14.6
- Git: 2.55.0.windows.5
- ОС: Windows 10, оболочка PowerShell
- Имя репозитория GitHub: terrikon_rabota
- URL репозитория: https://github.com/SteveNoth/terrikon_rabota
- URL сайта на Vercel: https://terrikon-rabota.vercel.app
- Команда Vercel: terrikon
- Проект Vercel: terrikon-rabota
- Проект Supabase: —
- Cookie города: `tr_city`
- Источник городов: `shared/geo.json` (читают и TypeScript, и Python)

## Решения, которые нельзя менять
- Стек выбран бесплатный (см. docs/DECISIONS.md)
- Tailwind CSS v4 (установлен create-next-app; Этап 2 делать в варианте для v4, не для v3)
- Города не пишутся строкой в `src/` — только через `shared/geo.json` (Закон 3)

## Открытые вопросы / долги
- GitHub ещё не подключён к проекту Vercel: `git push` пока сам сайт не обновляет. Нужно один раз связать репозиторий в панели Vercel (шаги в docs/SETUP-LOG.md).
- Next.js 16 предупреждает, что `middleware.ts` устарел в пользу `proxy.ts`. Файл оставлен как `src/middleware.ts`, потому что так написано в ядре и на следующих этапах его дополняем.
