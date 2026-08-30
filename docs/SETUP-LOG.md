# Журнал ручных настроек — Террикон Работа

Сюда записываем всё, что делаем руками в чужих интерфейсах (GitHub, Supabase, Vercel и т.д.).
Чтобы через полгода можно было повторить.

Формат записи: дата → что сделали → зачем.

---

## 2026-08-28 — Аккаунты (заполни после создания!)

| Сервис   | Статус      | Дата       | Примечание |
|----------|-------------|------------|------------|
| GitHub   | ☑ создан    | 2026-08-28 | логин: SteveNoth |
| Supabase | ☑ создан    | 2026-08-28 | вход через GitHub |
| Vercel   | ☑ создан    | 2026-08-28 | вход через GitHub |
| Telegram | ☑ создан    | 2026-08-28 | для будущего бота |

## 2026-08-28 — Git на этом компьютере

- Папка проекта: `C:\Users\Max\Desktop\TERRICON JOB\Project`
- Репозиторий git инициализирован локально (ветка `master`)
- Первый коммит: `e002a1e` — «Этап 0: подготовка проекта»
- Репозиторий на GitHub: ☑ создан — https://github.com/SteveNoth/terrikon_rabota
- ⚠️ Имя на GitHub: `terrikon_rabota` (подчёркивание). В git было `terrikon-rabota` (дефис) — из-за этого push не работал.

## 2026-08-28 — Версии программ (проверено)

```
node -v          → v24.20.0
npm -v           → 11.19.0
python --version → Python 3.14.6
git --version    → git version 2.55.0.windows.5
```

## 2026-08-28 — Этап 1: скелет Next.js

- Команда: `npx create-next-app@latest terrikon-rabota` (файлы перенесены в корень репозитория, чтобы сайт и `docs/` жили вместе)
- Next.js: 16.3.3
- Tailwind CSS: 4.3.3 (мажорная версия 4)
- React: 19.2.8
- Ветка этапа: `stage-01-skeleton`
- `.env.local` есть на диске и в `.gitignore` (в GitHub не попадает)
- `.env.example` — список переменных без секретов, попадает в git

## 2026-08-28 — Этап 1: деплой на Vercel

- Команда Vercel: `terrikon` (вход через аккаунт `stevenoth` / GitHub SteveNoth)
- Проект Vercel: `terrikon-rabota`
- Адрес сайта: https://terrikon-rabota.vercel.app
- Деплой сделан через Vercel CLI (`npx vercel --yes --prod`) из папки проекта
- Репозиторий: https://github.com/SteveNoth/terrikon_rabota
- Production-ветка GitHub: `master`
- Переменные окружения на первом деплое: не задавали (страница-заглушка их не читает)
- Где потом вводить переменные: Vercel → проект `terrikon-rabota` → Settings → Environment Variables. Для первого деплоя не нужны.
- ⚠️ GitHub-репозиторий пока не привязан к проекту Vercel (ошибка `Failed to connect SteveNoth/terrikon_rabota`). Из-за этого `git push` сам сайт ещё не обновляет. Что нажать руками:
  1. Открыть https://vercel.com/terrikon/terrikon-rabota/settings/git
  2. Нажать **Connect Git Repository** (подключить git-репозиторий)
  3. Если Vercel попросит доступ к GitHub — **Install** / **Authorize** приложение Vercel для аккаунта SteveNoth
  4. Выбрать репозиторий `SteveNoth/terrikon_rabota`
  5. Ветка для продакшена (живой сайт): `master`
  6. После этого каждый `git push` в `master` сам пересоберёт https://terrikon-rabota.vercel.app

## 2026-08-29 — Этап 4: проект Supabase и строки подключения

Проект базы ещё не создан руками — ниже точная инструкция. Когда сделаешь шаги, допиши в эту же секцию: имя проекта, регион, дату.

### Зачем два адреса (пул и прямой)

Представь кассу в магазине.

- **Пул (pooled, порт 6543)** — общая очередь. Сайт на Vercel на каждый запрос страницы открывает соединение с базой и сразу закрывает. Если каждый посетитель займёт «свою кассу навсегда», касс не хватит (на бесплатном тарифе их мало). Пул выдаёт кассу на секунду и забирает обратно. Это `DATABASE_URL`.
- **Прямое / сессионное (direct / session, порт 5432)** — выделенная касса надолго. Миграция (смена таблиц) — это длинный разговор: «создай таблицу, потом индекс, потом связь». Пул такой разговор обрывает. Это `DIRECT_URL`.

Сайт в работе → пул. Смена схемы и сиды → прямое соединение.

### Регион: Frankfurt (Central EU, `eu-central-1`)

Ближайший к Донбассу и к часовому поясу UTC+3 из тех, что даёт Supabase. Стокгольм чуть севернее, Ирландия западнее, США — плюс 100–200 мс на каждый запрос. На бесплатном тарифе лишняя задержка сразу заметна.

Если в списке нет Frankfurt — бери **West EU (Ireland)** или **North EU (Stockholm)**. Не бери US/Asia.

### Создать проект

1. Открыть https://supabase.com/dashboard и войти через GitHub (аккаунт уже есть, Этап 0).
2. **New project**.
3. Organization — своя (часто называется как GitHub-логин).
4. **Project name:** `terrikon-rabota` (как репозиторий и Vercel).
5. **Database password:** нажать Generate, **скопировать в надёжное место**. Этот пароль больше не покажут. Он будет внутри строк подключения.
6. **Region:** `Frankfurt` / `Central EU` / `eu-central-1`.
7. Тариф **Free**. Create project. Подождать 1–2 минуты, пока база поднимется.

### Где взять Connection string

1. В проекте нажать **Connect** (сверху) или **Project Settings → Database**.
2. Вкладка **ORMs** → Prisma **или** **Connection string**.

Нужны **две** строки:

**A. Transaction pooler (пул)** — порт **6543**:
```
postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true
```
Это `DATABASE_URL`. Обязательно `?pgbouncer=true` в конце (иначе Prisma ругается на prepared statements).

**B. Session pooler (для миграций)** — порт **5432**, тот же хост `pooler.supabase.com`:
```
postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
```
Это `DIRECT_URL`.

Почему session pooler, а не «Direct connection» на `db.xxxxx.supabase.co`: прямой адрес часто требует IPv6. Windows 10 его может не иметь, и миграция повиснет. Session pooler на 5432 — это «почти прямое» соединение, которое работает по IPv4.

Если в панели хост выглядит как `aws-0-eu-central-2...` — копируй **как есть**, не подставляй Frankfurt руками. Регион в хосте должен совпасть с тем, что выбрал при создании.

Вставить обе строки:
- в `.env.local` (его читает Next.js)
- в `.env` (его читает Prisma CLI; `prisma.config.ts` подхватывает оба файла)

### Где anon key и service_role key

**Project Settings → API Keys** (или **Settings → API**).

- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL` (это не секрет, адрес проекта).
- **anon public** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Этот ключ **можно** отдавать браузеру: он работает только в рамках правил безопасности базы (RLS). Сейчас сайт ходит в базу через Prisma на сервере, поэтому ключ пока просто лежит в `.env.local`.
- **service_role** → `SUPABASE_SERVICE_ROLE_KEY`. Этот ключ **нельзя** показывать браузеру и нельзя называть `NEXT_PUBLIC_...`.

Почему service_role нельзя в браузер: он обходит все правила доступа и может читать, менять и удалять любые таблицы. Это как ключ от всей квартиры. Если его вшить в страницу, любой посетитель через «просмотр кода» получит полный доступ к базе.

Строки `NEXT_PUBLIC_` видны всем, кто открыл сайт. service_role — только на сервере.

Ключи на этом этапе в код не подключаем — только сохраняем в `.env.local`, в git они не попадают (`.gitignore` уже закрывает `.env*`).

### Переменные в Vercel (чтобы живой сайт видел базу)

Пока страницы базу не читают (это Этап 5), но переменные заводим сразу: иначе после деплоя сайт «не знает», где база.

1. Открыть https://vercel.com/terrikon/terrikon-rabota/settings/environment-variables
2. **Add New**:
   - Key `DATABASE_URL` — значение как в `.env.local` (пул, порт 6543, `?pgbouncer=true`). Environments: Production, Preview, Development.
   - Key `DIRECT_URL` — session/direct, порт 5432. Те же три среды.
3. Сохранить. Для уже сделанного деплоя переменные сами не подхватятся — нужен новый деплой (после Этапа 5 это станет важно). Сейчас достаточно, что они лежат в настройках.

Не добавляй `SUPABASE_SERVICE_ROLE_KEY` с галочкой «Expose to client» / не используй префикс `NEXT_PUBLIC_`.

### После того как строки вставлены

В папке проекта:

```
npx prisma migrate deploy
npx prisma db seed
npx prisma migrate status
npx prisma studio
```

`migrate deploy` накатывает файл из `prisma/migrations/` на пустую базу. Не рисуй таблицы руками в Table Editor: тогда история миграций разъедется с реальной базой, и следующий `migrate` сломается. Закон 11: всё воспроизводимо.

### Шаблон записи (заполни когда сделаешь)

- Дата: 2026-08-29
- Проект Supabase: `terrikon-rabota` (ref `ptbtyfvszliqagnvpocf`)
- Регион: Frankfurt / `eu-central-1` (хост `aws-0-eu-central-1.pooler.supabase.com`)
- DATABASE_URL и DIRECT_URL вписаны в `.env` и `.env.local`: ☑ (пул 6543 + `pgbouncer=true`, session 5432)
- Vercel: `DATABASE_URL` и `DIRECT_URL` добавлены: ☑ (подтверждено 2026-08-29)
- Ключи anon / service_role сохранены в `.env.local`, в git не попадают: ☑
- Миграция `20260829000000_init` применена: ☑
- Сиды: 15 вакансий (12 местных + 3 вахты), 3 работодателя, 8 сфер, 15 профессий: ☑
- Таблицы руками в Table Editor не создавали: ☑

## 2026-08-29 — Живой сайт: повторный деплой (не заглушка)

- GitHub к Vercel по-прежнему не привязан, поэтому `git push` сам сайт не обновляет.
- Выложили текущий проект командой `npx vercel --prod --yes` (аккаунт `stevenoth`).
- Первый проход после заглушки падал: Vercel ходил в базу со **старым паролем** (`Authentication failed`). `DATABASE_URL` в Production обновили из локального `.env.local` (значение в лог не писали). После второго деплоя https://terrikon-rabota.vercel.app открывает главную города, не текст «Скоро здесь будут вакансии…».
- Чтобы следующие этапы выезжали сами: всё ещё нужно Connect Git Repository — шаги в записи от 2026-08-28.

## 2026-08-30 — Tesseract на Windows (Этап 14B), ещё не установлен

Пока `OCR_PROVIDER=none`: конвейер жив, картинки не читаются. Когда будешь ставить:

1. Установщик: https://github.com/UB-Mannheim/tesseract/wiki (Windows).
2. В мастере отметь язык **Russian**. Папка по умолчанию: `C:\Program Files\Tesseract-OCR`.
3. Добавь эту папку в PATH (системные переменные среды).
4. При необходимости в `.env.local`:
   - `OCR_PROVIDER=tesseract`
   - `TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe`
   - `TESSDATA_PREFIX=C:\Program Files\Tesseract-OCR\tessdata`
5. Новое окно PowerShell, проверка:

```
tesseract --list-langs
```

В списке должны быть `rus` и `eng`.

GitHub Actions (Этап 16, ещё не пишем workflow):

```
sudo apt-get update
sudo apt-get install -y tesseract-ocr tesseract-ocr-rus
tesseract --list-langs
```

Tesseract — системная программа. `pip install -r requirements.txt` ставит только `pytesseract` и `pillow`.


