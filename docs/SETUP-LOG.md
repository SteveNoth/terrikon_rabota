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

Tesseract — системная программа. `pip install -r requirements.txt` ставит `pytesseract`, `pillow` и (с Этапа 15) `psycopg`.

## 2026-08-30 — Этап 15: CRON_SECRET и секреты для двери парсеров

`CRON_SECRET` — пароль, которым роботы доказывают, что они свои. Длина не меньше 32 символов.

Сгенерировать в PowerShell:

```
[BitConverter]::ToString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).Replace('-','').ToLower()
```

Куда вставить одно и то же значение (в git не попадает):

1. `.env.local` — строка `CRON_SECRET=...` (читает Next и `scripts/send_test.py`)
2. Vercel → проект terrikon-rabota → Settings → Environment Variables → `CRON_SECRET` (Production, Preview, Development)
3. GitHub → SteveNoth/terrikon_rabota → Settings → Secrets and variables → Actions:
   - `CRON_SECRET`
   - `SITE_URL` = `https://terrikon-rabota.vercel.app`
   - `DATABASE_URL` и `DIRECT_URL` — те же, что у Prisma (для `scripts/regroup.py` ночью)

Проверка длины (секрет не печатает):

```
((Get-Content .env.local | Where-Object { $_ -like 'CRON_SECRET=*' } | Select-Object -First 1) -replace '^CRON_SECRET=','').Trim().Length
```

2026-08-30: секрет есть в `.env.local` (64 символа). В Vercel CLI в списке переменных были `DATABASE_URL` / `DIRECT_URL`, **`CRON_SECRET` и `SITE_URL` ещё не добавлены**. GitHub CLI (`gh`) на этой машине нет — секреты Actions тоже нужно вставить руками (шаг 3 выше). Пока их нет, прод и ночной `regroup.yml` эту дверь не откроют.

Миграция схемы приёма: `npx prisma migrate deploy` (файл `prisma/migrations/20260830150000_parser_ingest`).

## 2026-08-30 — Этап 16: приложение ВКонтакте, токен, GitHub Secrets, минуты Actions

Юридическое решение (почему только официальный API, что не делаем): `docs/SOURCES-LEGAL.md`.

**access_token** — пароль приложения к API. **v** — номер версии API, обязателен в каждом запросе (у нас `5.199`, можно сменить через `VK_API_VERSION`).

### A. Создать приложение и получить токен (только официальный путь)

1. Войти в свой аккаунт ВКонтакте.
2. Открыть https://vk.com/apps?act=manage (или https://vk.ru/apps?act=manage) — «Мои приложения».
3. **Создать** / **Create**. Если предлагают тип: **Standalone-приложение** (отдельное приложение), не игра и не сайт. Имя: `Террикон Работа`. Платформа любая.
4. После создания откроются настройки. Запиши **ID приложения** (число, его не секрет).
5. Токен для чтения **открытых** стен. Два штатных варианта, оба из кабинета VK:

   **Вариант 1 (проще, если доступен в настройках приложения): сервисный ключ.**  
   Настройки приложения → раздел ключей / «Работы с API» → **Сервисный ключ доступа**. Скопируй. Он годится для открытых стен методом `wall.get`.

   **Вариант 2: ключ пользователя, который не истекает через сутки.**  
   В браузере, уже под своим аккаунтом, открой (подставь свой ID приложения вместо `APP_ID`):

   `https://oauth.vk.com/authorize?client_id=APP_ID&display=page&redirect_uri=https://oauth.vk.com/blank.html&scope=offline&response_type=token&v=5.199`

   Нажми «Разрешить». Браузер попадёт на страницу `https://oauth.vk.com/blank.html#access_token=...&expires_in=0&...`.  
   Скопируй значение **между** `access_token=` и следующим `&`. Это и есть токен. Параметр `scope=offline` значит «не отключать через 24 часа». Для открытых стен право `wall` не нужно: мы не пишем на стену, только читаем.

6. Токен **никому не отправляй в чат и не клади в git**. Если токен светился в адресной строке — не делай скриншот этой строки.

Не используй токены вида `vk2.a.*` из VK ID, если `wall.get` на них отвечает ошибкой: это ключ входа в аккаунт, не ключ методов API. Не логируйся паролем из скрипта. Не открывай `vk.com/club...` как HTML.

Если API ответит «Access denied» / код 15 или 203 — группа закрыта или метод недоступен этому ключу. Группу выключаем в `scripts/sources_vk.json` (`enabled: false`). Не обходим.

### B. Куда вставить токен локально

В папке проекта файл `.env.local` (он уже в `.gitignore`). Добавь строки, **без пробелов вокруг `=`**. Имя переменной `VK_TOKEN`, значение — токен в той же строке после `=`. Плюс:

```
SOURCE_VK_ENABLED=true
VK_API_VERSION=5.199
OCR_PROVIDER=tesseract
SITE_URL=http://127.0.0.1:3000
```

Строку с самим токеном в этот журнал и в чат не копируй. Образец без значения есть в `.env.example`.

`CRON_SECRET` для обычного запуска (не `--dry-run`) уже должен быть в этом файле с Этапа 15.

Проверка, что токен есть, **не печатая его** (PowerShell, папка проекта):

```
if (((Get-Content .env.local | Where-Object { $_ -like 'VK_TOKEN=*' } | Select-Object -First 1) -replace '^VK_TOKEN=','').Trim().Length -gt 20) { 'токен на месте' } else { 'токена нет или слишком короткий' }
```

### C. GitHub Secrets — куда нажимать

Секреты живут **в репозитории**, не в профиле GitHub. В git они не попадают: Actions подставляет их только во время запуска.

1. Открыть https://github.com/SteveNoth/terrikon_rabota
2. Вкладка **Settings** (настройки **репозитория**, справа вверху у списка файлов; не шестерёнка профиля).
3. Если GitHub просит подтвердить пароль — подтверди.
4. Слева в колонке: **Secrets and variables** → **Actions**.
5. Кнопка **New repository secret**.
6. Добавь три секрета (имя — точно как написано, без пробелов):

   | Name | Value |
   |---|---|
   | `VK_TOKEN` | тот же токен, что в `.env.local` |
   | `CRON_SECRET` | тот же, что в `.env.local` (≥ 32 символа) |
   | `SITE_URL` | `https://terrikon-rabota.vercel.app` |

7. Для каждого: **Add secret**. Значение потом не показывают — только «Update».
8. На этой же странице должны появиться имена (не значения). Для ночного `regroup.yml` по-прежнему нужны `DATABASE_URL` и `DIRECT_URL`, если ещё не добавлены.

Тот же `CRON_SECRET` должен стоять в Vercel, иначе живой сайт не примет пачку от парсера. Пошагово:

1. Открыть https://vercel.com/terrikon/terrikon-rabota/settings/environment-variables (войти тем же GitHub-аккаунтом SteveNoth).
2. Если переменная `CRON_SECRET` уже есть в списке — справа **⋯** → **Edit**. Если нет — кнопка **Add New** / **Create new**.
3. **Key** (имя): `CRON_SECRET` — точно так, без пробелов.
4. **Value** (значение): тот же секрет, что в `.env.local`. В чат его не копируй. Удобно из PowerShell, находясь в папке проекта — секрет попадёт в буфер, вставишь в поле Vercel сочетанием Ctrl+V:

```
Set-Clipboard (((Get-Content .env.local | Where-Object { $_ -like 'CRON_SECRET=*' } | Select-Object -First 1) -replace '^CRON_SECRET=','').Trim())
```

5. **Environments:** отметь **Production**, **Preview** и **Development** (все три). Иначе прод будет с секретом, а превью-деплой — без.
6. **Save**.
7. Новая переменная **сама на уже выложенный сайт не попадает**. Нужен новый деплой: на Vercel → вкладка **Deployments** → у верхнего Production **⋯** → **Redeploy** → подтвердить. Если GitHub к проекту всё ещё не привязан — в папке проекта: `npx vercel --prod --yes`.
8. Проверка без печати секрета: после деплоя локальный `python scripts/parser_vk.py --dry-run --limit 5` секрета Vercel не проверяет. Обычный запуск с `SITE_URL=https://terrikon-rabota.vercel.app` проверит дверь: HTTP 401 значит секрет на Vercel другой или деплоя не было; HTTP 200 — совпало.

`SITE_URL` на Vercel для сайта не обязателен: его читает парсер в GitHub Actions из GitHub Secret. На Vercel достаточно `CRON_SECRET` (плюс уже стоящие `DATABASE_URL` / `DIRECT_URL`).

Проверка расписания руками: вкладка **Actions** → слева workflow **parser-vk** → кнопка **Run workflow** → **Run workflow**. После завершения: в run открыть **parser-vk-logs** (Artifacts) и скачать zip с `logs/`.

### D. Минуты GitHub Actions — где смотреть и сколько съест cron

Где смотреть:

1. Счётчик аккаунта: https://github.com/settings/billing (аватар справа вверху → **Settings** → **Billing and licensing** / **Billing**). Блок **Actions** / **Usage** — сколько минут уже израсходовано в этом месяце.
2. Длительность одного запуска: репозиторий → вкладка **Actions** → конкретный run → справа время вроде `3m 12s`.

Сколько съест расписание `0 */3 * * *` (каждый третий час, в `:00`):

- Запусков в сутки: 24 / 3 = **8**
- За месяц (30 дней): 8 × 30 = **240**
- Один прогон примерно: установка Tesseract ~1 мин + pip из кэша ~0.5 мин + запросы к API и OCR 1–4 мин ≈ **3–6 минут**
- Итого: 240 × 4 мин ≈ **960 минут/месяц** (вилка примерно 720–1440)

Лимиты GitHub Free (нужно сверить на странице billing, цифры тарифа меняются):

- **Публичный** репозиторий: минуты стандартных runner’ов обычно не из квоты в 2000 (действует fair use).
- **Приватный**: **2000 минут/месяц** на бесплатном плане. 960 из 2000 — около половины, плюс ночной `regroup.yml` (~1–5 мин/сутки). Если репозиторий станет приватным и минуты кончатся — парсер встанет до 1-го числа. Тогда либо реже cron (`0 */6 * * *` = вдвое меньше), либо публичный репозиторий.

Пока в `sources_vk.json` нет включённых групп, cron всё равно ставит Tesseract и тратит ~1–2 минуты на пустой прогон. Имеет смысл сначала заполнить группы и прогнать **Run workflow** руками, и только потом полагаться на расписание.

Шаблон отметки (допиши когда сделаешь):

- Дата:
- Приложение VK создано, ID:
- `VK_TOKEN` в `.env.local`: ☐ (значение в этот файл журнала не писать)
- GitHub Secrets `VK_TOKEN`, `CRON_SECRET`, `SITE_URL`: ☐
- Vercel `CRON_SECRET` и `SITE_URL`: ☐
- Ручной запуск `parser-vk`: ☐
- Артефакт логов скачивается: ☐

## 2026-08-30 — Этап 17: api_id, api_hash, строка сессии Telegram, GitHub Secrets

Юридическое решение (почему client API, что такое StringSession, что не делаем): `docs/SOURCES-LEGAL.md`.

Это **не** токен бота из `@BotFather` (`TELEGRAM_BOT_TOKEN` — Этап 22). Здесь парсер входит как обычный клиент Telegram и читает публичные каналы.

### A. Что такое `api_id`, `api_hash` и строка сессии

- **`api_id`** — номер твоего приложения на https://my.telegram.org. Число, его видно в кабинете.
- **`api_hash`** — секретный ключ того же приложения. Вместе с `api_id` Telegram понимает, какая программа стучится.
- **Строка сессии (`StringSession`)** — «уже вошли». После того как один раз ввёл телефон и код, скрипт больше не спрашивает SMS. По смыслу это тот же ключ, что файл `account.session` на диске: укравший строку входит в аккаунт. Поэтому строку создаём **один раз локально** и кладём в GitHub Secrets, а файл сессии в git не коммитим (`.gitignore` уже закрывает `*.session`).

Почему не файл в репозитории: Actions крутится на чужой машине GitHub. Если положить `.session` в git, его увидит кто угодно с доступом к репо. Секрет GitHub подставляется только на время запуска и в историю коммитов не попадает.

Лучше отдельный аккаунт Telegram для парсера, не тот, где личная переписка.

### B. Получить `api_id` и `api_hash` на my.telegram.org

1. Открой https://my.telegram.org в браузере.
2. Введи номер телефона аккаунта, с которого парсер будет читать каналы (с кодом страны, например `+7…`).
3. Код подтверждения придёт **в приложение Telegram** (не обязательно SMS). Введи его на сайте.
4. Нажми **API development tools**.
5. Если приложения нет — создай: App title `Terricon Rabota`, Short name `terrikon`, Platform **Other**. URL можно пустым.
6. На странице появятся **App api_id** (число) и **App api_hash** (длинная строка из латиницы и цифр). Скопируй оба. В чат и в git не клади.

Не путай с токеном вида `123456:ABC…` от `@BotFather` — тот сюда не подходит.

### C. Вставить ключи локально и создать строку сессии

В `.env.local` (уже в `.gitignore`), без пробелов вокруг `=`:

```
TG_API_ID=
TG_API_HASH=
SOURCE_TG_ENABLED=true
OCR_PROVIDER=tesseract
SITE_URL=http://127.0.0.1:3000
```

После знака `=` — значения с my.telegram.org. Строку с ключами в этот журнал не копируй. Образец без значений есть в `.env.example`.

Один раз на этой машине, из корня проекта:

```
.\.venv\Scripts\python.exe scripts/make_tg_session.py
```

Скрипт спросит телефон, код из Telegram, пароль двухэтапной проверки (если включён). Файл `*.session` на диск не пишет. В конце напечатает длинную строку между «начало TG_SESSION» и «конец». Это и есть сессия.

Добавь в `.env.local`:

```
TG_SESSION=
```

после `=` — та длинная строка целиком, без кавычек, если в ней нет пробелов.

Проверка, что сессия есть, **не печатая её** (PowerShell, папка проекта):

```
if (((Get-Content .env.local | Where-Object { $_ -like 'TG_SESSION=*' } | Select-Object -First 1) -replace '^TG_SESSION=','').Trim().Length -gt 20) { 'сессия на месте' } else { 'сессии нет' }
```

`CRON_SECRET` для обычного запуска (не `--dry-run`) уже должен быть в этом файле с Этапа 15.

Проверка парсера, когда в `sources_tg.json` появятся каналы:

```
.\.venv\Scripts\python.exe scripts/parser_tg.py --dry-run --limit 5
```

Пока каналы выключены, скрипт напишет, что список пуст, и не пойдёт в Telegram.

### D. GitHub Secrets — куда нажимать

Секреты живут **в репозитории**, не в профиле GitHub. В git они не попадают.

1. Открыть https://github.com/SteveNoth/terrikon_rabota
2. Вкладка **Settings** (настройки репозитория, не шестерёнка профиля).
3. Слева: **Secrets and variables** → **Actions**.
4. **New repository secret**. Добавь (имя — точно как написано):

   | Name | Value |
   |---|---|
   | `TG_API_ID` | число с my.telegram.org |
   | `TG_API_HASH` | ключ с my.telegram.org |
   | `TG_SESSION` | строка из `make_tg_session.py` |
   | `CRON_SECRET` | тот же, что для ВК (≥ 32 символа), если ещё не добавлен |
   | `SITE_URL` | `https://terrikon-rabota.vercel.app` |

5. Для каждого: **Add secret**. Значение потом не показывают — только «Update».

Тот же `CRON_SECRET` должен стоять в Vercel (шаги в записи Этапа 16). Иначе живой сайт не примет пачку.

Проверка расписания руками: вкладка **Actions** → слева workflow **parser-tg** → **Run workflow**. После завершения скачай артефакт **parser-tg-logs**. Расписание: `30 1,4,7,10,13,16,19,22 * * *` — каждые три часа в `:30`, со сдвигом относительно ВК (`0 */3`, то есть в `:00`), чтобы два парсера не стартовали в одну минуту.

### E. Минуты GitHub Actions

Те же 8 запусков в сутки, что у ВК (раз в 3 часа). За месяц ≈ 240 прогонов. Один прогон с Tesseract примерно 3–6 минут ≈ ещё **960 минут/месяц** сверху к парсеру ВК.

Вместе ВК + Telegram ≈ 16 запусков/сутки, порядка 1500–2000 минут/месяц. На **публичном** репозитории минуты стандартных runner’ов обычно не из квоты 2000. На **приватном** бесплатном плане 2000 минут — два парсера плюс `regroup.yml` могут выбрать лимит. Тогда реже cron или публичный репозиторий.

Пока в `sources_tg.json` нет включённых каналов, cron всё равно ставит Tesseract. Сначала заполни каналы, прогони **Run workflow** руками, потом полагайся на расписание.

Шаблон отметки (допиши когда сделаешь):

- Дата:
- Приложение на my.telegram.org создано, api_id: (число можно, hash в этот файл не писать)
- `TG_API_ID` / `TG_API_HASH` / `TG_SESSION` в `.env.local`: ☐
- GitHub Secrets `TG_API_ID`, `TG_API_HASH`, `TG_SESSION`: ☐
- `python scripts/make_tg_session.py` выполнен локально: ☐
- Ручной запуск `parser-tg`: ☐
- Артефакт логов скачивается: ☐

## 2026-08-30 — Этап 18: сайты предприятий, CSS-селекторы, экономия минут Actions

Юридическое решение: `docs/SOURCES-LEGAL.md`, раздел «Сайты предприятий». Список: `scripts/config_web.json`. Выключатель `SOURCE_WEB_ENABLED`.

В конфиге живые HTML-источники (проверены 2026-08-30):

1. https://vodadonbassa.ru/job-openings/ — «Вода Донбасса», филиал Горловское ПУВКХ.
2. https://dtedn.ru/o-predpriyatii/vakansii2?department[]=4 — «Донбасстеплоэнерго», Горловкатеплосеть.
3. https://mozaika.biz/vakansy/ — «Горловская мозаика». Только 1-я страница: `robots.txt` запрещает `/page/`. Часто пересекается с группой ВК `rabota.gorlovka`.
4. https://rabotadnr.com/job/vacancy/city/gorlovka — «Работа ДНР», фильтр Горловка.

Не в конфиге (только API / открытые данные, см. `docs/SOURCES-LEGAL.md`): Avito, OK.ru `rabotavdn`, Мой ЦЗН / `trudvsem.ru`.

Если есть ещё страницы вакансий горловских заводов (Стирол, Горловский машзавод, свои HTML, не hh.ru и не Avito) — пришли URL, добавим.

### A. Как самому найти CSS-селектор через DevTools

Это «картинка шагами». Делается в Chrome или Edge, на странице списка вакансий.

```
┌─────────────────────────────────────────────────────────────┐
│  1. Открой страницу вакансий предприятия.                   │
│                                                             │
│  2. Наведи мышь на ОДНУ карточку (название должности).      │
│     Правая кнопка → «Просмотреть код» / Inspect.            │
│                                                             │
│     ┌──────────────────────┐     ┌────────────────────────┐ │
│     │  [ Сварщик 4 р.    ] │ ──► │ <article class="job">  │ │
│     │    Горловка  45 000  │     │   <h2 class="title">   │ │
│     │                      │     │     <a href="/j/12">   │ │
│     └──────────────────────┘     │   <p class="city">     │ │
│                                  └────────────────────────┘ │
│                                                             │
│  3. В панели Elements подсветится HTML этой карточки.       │
│     Селектор карточки — class/тег, который повторяется      │
│     у КАЖДОЙ вакансии. Это item_selector.                   │
│     Пример: article.job   или   .vacancy-card               │
│                                                             │
│  4. Внутри той же карточки щёлкни название → title_selector │
│     (часто h2 или a). Описание → description_selector.      │
│     Зарплата → salary_selector. Город → city_selector.      │
│     Ссылка «подробнее» → link_selector (тег a).             │
│                                                             │
│  5. Проверь, что селектор не ловит меню и подвал:           │
│     Ctrl+F в панели Elements, вставь селектор,              │
│     счётчик совпадений ≈ числу вакансий на экране.          │
│                                                             │
│  6. Выключи JavaScript (F12 → ⋮ → Settings → Debugger →     │
│     Disable JavaScript) и обнови страницу.                  │
│     Карточки на месте? javascript: false (дешёвый путь).    │
│     Белый экран / «Загрузка…»? javascript: true —           │
│     тогда нужен Playwright, и Actions начнёт качать браузер.│
│                                                             │
│  7. Открой https://сайт/robots.txt.                         │
│     Если твой путь в Disallow — эту страницу не берём.      │
│                                                             │
│  8. Впиши поля в scripts/config_web.json, enabled: true.    │
│     Проверка:                                               │
│     python scripts/parser_web.py --dry-run --limit 5        │
└─────────────────────────────────────────────────────────────┘
```

Пустые селекторы (`""`) можно оставить, если поле лежит в тексте самой карточки: парсер тогда берёт текст элемента `item_selector`.

### B. Почему браузер Playwright в расписании обычно не ставим

`pip install playwright` — маленькая обёртка, она в `requirements.txt`.

`python -m playwright install chromium` качает браузер (~150 МБ) и на Ubuntu ещё системные библиотеки (`--with-deps`). Это **1–3 минуты каждого запуска**. Расписание `0 5 * * *` — раз в сутки, 30 раз в месяц ≈ **30–90 лишних минут**. На приватном репозитории лимит бесплатного плана 2000 минут; ВК и Telegram уже едят Tesseract каждые три часа.

Поэтому workflow `.github/workflows/parser-web.yml` сначала спрашивает `python scripts/parser_web.py --needs-js`. Браузер ставится, только если хоть один включённый сайт в конфиге с `javascript: true`. Сейчас оба источника — обычный HTML, Chromium не качаем. Tesseract в этом workflow тоже нет: текст уже в HTML.

### C. Локальная проверка и секреты

В `.env.local` (уже в gitignore):

```
SOURCE_WEB_ENABLED=true
SITE_URL=http://127.0.0.1:3000
```

`CRON_SECRET` нужен только без `--dry-run` (тот же, что для ВК).

```
.\.venv\Scripts\pip.exe install -r requirements.txt
.\.venv\Scripts\python.exe scripts\parser_web.py --dry-run --limit 5
```

GitHub Secrets те же `CRON_SECRET` и `SITE_URL`, новых ключей нет. Ручной запуск: Actions → **parser-web** → Run workflow. Расписание: `0 5 * * *` (05:00 UTC).

Если в отчёте «сайт X: 0 элементов, вероятно, изменилась вёрстка» — селектор устарел, не «вакансий нет». Открой страницу, повтори шаги A.

Шаблон отметки:

- Дата: 2026-08-30
- Сухой прогон нашёл вакансии с Воды Донбасса / Донбасстеплоэнерго: ☑ (`--dry-run`: Вода — soup, телефоны, уникальные id; DTEDN — soup, ссылки на карточки, индекс 284627 больше не читается как зарплата)
- GitHub Secrets `CRON_SECRET`, `SITE_URL` (уже с Этапа 16): ☐
- Ручной запуск `parser-web`: ☐
- Артефакт логов скачивается: ☐

---

## 2026-08-30 — Этап 18A: открытые данные «Работы России»

Код региона **не угадывали.** Справочник — поле `vacancy.region` в JSON (отдельного списка регионов в WADL нет).

| Что | Значение |
|---|---|
| Код | `9300000000000` |
| Имя в API | Донецкая Народная Республика |
| Откуда взяли | `GET https://opendata.trudvsem.ru/api/v1/vacancies?text=Горловка&limit=2` → `results.vacancies[].vacancy.region.region_code` |
| Подтверждение | `GET https://opendata.trudvsem.ru/api/v1/vacancies/region/9300000000000?offset=0&limit=1` → 200, `meta.total` = 7951 |
| WADL | `https://opendata.trudvsem.ru/api/v1/vacancies/application.wadl` |
| Условия | https://trudvsem.ru/opendata — свободное использование при указании источника |

Горловка в справочнике регионов как субъект не числится (город внутри ДНР). Соседний код не подставляли.

Выключатель: `SOURCE_TRUDVSEM_ENABLED` в `.env.local` / GitHub Actions. Ключа API нет. Секреты те же `CRON_SECRET` и `SITE_URL`.

```
.\.venv\Scripts\python.exe scripts\parser_trudvsem.py --dry-run --limit 3
```

Расписание: `.github/workflows/parser-trudvsem.yml`, cron `0 6 * * *` (после сайтов `0 5`). Tesseract и Chromium не ставим. Оценка минут: при шаге 100 и ~80 страницах пауза 1–3 с ≈ 5–10 мин/запуск × 30 ≈ **150–300 мин/месяц**. С этой машины `limit=100` и `limit=10` дают Read timeout; `limit=5` отвечает. Парсер при таймауте уменьшает шаг до 5, прокси не включает. `--dry-run --limit 3` сам берёт шаг 5.

Живой сухой прогон 2026-08-30:

- Регион 9300000000000, в API 7951
- Собрано 50 записей региона, совпало с городом 3 (Инженер, Слесарь, Слесарь)
- Работодатель «ДОНБАССГАЗ» / филиал, ИНН 9704210635
- Зарплата числом из JSON, подпись `salaryIsGross: True (до вычета налога)`
- `sourceUrl` на `https://trudvsem.ru/vacancy/card/...`, не m-czn.ru
- Чужих городов 47 — пропуск, в dry-run в базу не писали
- OCR_PROVIDER для этого парсера принудительно `none`

Шаблон отметки:

- Дата: 2026-08-30
- Код региона из справочника API, не угадан: ☑ `9300000000000`
- Сухой прогон Горловки с «до вычета» и ссылкой trudvsem: ☑
- HTML m-czn / trudvsem.ru не читаем: ☑
- GitHub Secrets `CRON_SECRET`, `SITE_URL` (те же): ☐
- Ручной запуск `parser-trudvsem`: ☐
- Миграция `trudvsem` накатана на Supabase: ☐

---

## 2026-08-31 — Этап 19: ADMIN_PASSWORD на Vercel и в GitHub

Проект Vercel `terrikon/terrikon-rabota`, репозиторий `SteveNoth/terrikon_rabota`. Значение — то же, что в `.env.local`, в этот журнал не копируем. Без переменной на Vercel страница `/admin` на деплое закрыта.

- **Vercel Production и Preview:** заданы (Production уже был; Preview — 2026-08-31; пользователь подтвердил оба контура).
- **GitHub Secrets** репозитория: `ADMIN_PASSWORD` добавлен пользователем 2026-08-31. Сайт его оттуда не читает — вход в админку идёт через env Vercel. Секрет в Actions пригодится, если когда-нибудь робот будет ходить на `/admin`.
- **Development** на Vercel не ставили: локально читается `.env.local`.

Код админки на живой сайт сам не попадёт, пока GitHub не привязан. После merge в `master`: `npx vercel --prod --yes`, либо Redeploy в кабинете.

---

## 2026-08-31 — Этап 20: Supabase Auth (почта + пароль)

Сайт не ходит в Supabase Auth из страниц. Только `src/lib/adapters/auth.ts`. Ключи уже в `.env.example`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. `AUTH_DRIVER=supabase` (или `none`, если вход надо выключить).

В кабинете Supabase:

1. **Authentication → Providers → Email** — включён. Confirm email — **включён** (после регистрации человек подтверждает почту по ссылке).
2. **Authentication → URL Configuration**
   - Site URL: локально `http://localhost:3000`, на проде `https://terrikon-rabota.vercel.app` (или актуальный `NEXT_PUBLIC_SITE_URL`).
   - Redirect URLs (все добавить):
     - `http://localhost:3000/auth/callback`
     - `http://localhost:3000/auth/callback?next=/auth/confirmed`
     - `http://localhost:3000/auth/callback?next=/auth/reset`
     - те же три с адресом продакшена.
3. Письма: на бесплатном тарифе — встроенная почта Supabase (лимит небольшой). Для продакшена позже можно свой SMTP; пока хватает.
4. На Vercel те же `NEXT_PUBLIC_SUPABASE_URL` и `NEXT_PUBLIC_SUPABASE_ANON_KEY`, плюс `NEXT_PUBLIC_SITE_URL` без слэша на конце. `SUPABASE_SERVICE_ROLE_KEY` для входа **не нужен** (его не кладём в клиент и в адаптер входа не используем).
5. Миграция `20260831180000_employer_auth`: поля `User.authId` и `Employer.userId`. Накатить: `npx prisma migrate deploy` (нужен `DIRECT_URL`).

Проверка: регистрация → письмо → `/auth/confirmed` → вход → кабинет работодателя → вакансия с меткой «Размещено работодателем». Выбор Донецка в форме вакансии не сохраняет, текст про Горловку.

Шаблон отметки:

- Дата: 2026-08-31
- Email-провайдер включён, confirm email: ☐
- Redirect URLs (local + prod): ☐
- Миграция `employer_auth` накатана на Supabase: ☐
- `NEXT_PUBLIC_SITE_URL` на Vercel: ☐

## 2026-08-31 — Этап 20A часть 2: очередь кабинета и блок аккаунта

Миграция `20260831200000_account_blocks`: enum `AccountBlockScope`, таблица `AccountBlock`, флаги `User.publishBlocked` / `applyBlocked` / `loginBlocked`. Накатить: `npx prisma migrate deploy` (нужен `DIRECT_URL`).

Бан в панели Supabase Auth не ставим: источник правды — наша база. Снятие PUBLISH телефон само не белит.

Шаблон отметки:

- Дата: 2026-08-31
- Миграция `account_blocks` накатана на Supabase: ☑ (локально, 2026-08-31)

## 2026-08-31 — Этап 21: кабинет соискателя

Миграция `20260831210000_seeker_profile`: поля `User.resumeText`, `resumeUrl`, `notifyTelegram`, `telegramLinkCode`. Накатить: `npx prisma migrate deploy` (нужен `DIRECT_URL`).

Имя бота `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` (без @) нужно только для ссылки `t.me/<бот>?start=<код>`. Пока пусто — в профиле виден код, ссылка появится на Этапе 22. Webhook и рассылку на этом этапе не ставим.

Шаблон отметки:

- Дата: 2026-08-31
- Миграция `seeker_profile` накатана на Supabase: ☑ (локально, 2026-08-31)
- `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` (можно пустым до этапа 22): ☐



