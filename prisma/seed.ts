import { createHash } from "node:crypto";
import { config as loadEnv } from "dotenv";
import {
  ContactVerdictKind,
  EmployerKind,
  EmploymentType,
  Experience,
  GeocodeAccuracy,
  ModerationStatus,
  PrismaClient,
  SalaryPeriod,
  Source,
  WorkFormat,
  type Prisma,
} from "@prisma/client";
import geoJson from "../shared/geo.json";
import { buildGeocodeQuery } from "../src/lib/geo/geocode-query";

loadEnv({ path: ".env", quiet: true });
loadEnv({ path: ".env.local", override: true, quiet: true });

const prisma = new PrismaClient();

type GeoCity = (typeof geoJson.cities)[number];
type GeoDistrict = GeoCity["districts"][number];
type GeoDestination = (typeof geoJson.externalDestinations)[number];

type Sections = {
  description: string;
  tasks: string[];
  requirements: string[];
  conditions: string[];
};

function mustCity(slug: string): GeoCity {
  const city = geoJson.cities.find((item) => item.slug === slug);
  if (!city) {
    throw new Error(`shared/geo.json: нет города ${slug}`);
  }
  return city;
}

function mustDistrict(city: GeoCity, slug: string): GeoDistrict {
  const district = city.districts.find((item) => item.slug === slug);
  if (!district) {
    throw new Error(`shared/geo.json: у ${city.slug} нет района ${slug}`);
  }
  return district;
}

function mustDestination(slug: string): GeoDestination {
  const destination = geoJson.externalDestinations.find((item) => item.slug === slug);
  if (!destination) {
    throw new Error(`shared/geo.json: нет направления ${slug}`);
  }
  return destination;
}

function contentHash(text: string): string {
  const slice = text.replace(/\s+/g, " ").trim().slice(0, 500);
  return createHash("sha1").update(slice).digest("hex");
}

function signature(parts: {
  professionSlug: string;
  workFormat: WorkFormat;
  workLocation: string;
  salaryFrom: number | null;
  rotation: string | null;
}): string {
  const salaryBucket = parts.salaryFrom == null ? "none" : String(Math.floor(parts.salaryFrom / 10_000) * 10_000);
  return [parts.professionSlug, parts.workFormat, parts.workLocation, salaryBucket, parts.rotation ?? ""].join("|");
}

function daysAgo(days: number): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  date.setUTCHours(9, 0, 0, 0);
  return date;
}

let pointSalt = 0;

function pointForDistrict(city: GeoCity, districtSlug: string): { lat: number; lng: number } {
  const district = city.districts.find((item) => item.slug === districtSlug);
  const base =
    district && "center" in district && district.center
      ? { lat: district.center.lat, lng: district.center.lng }
      : { lat: city.center.lat, lng: city.center.lng };
  pointSalt += 1;
  const mix = pointSalt * 17;
  return {
    lat: base.lat + ((mix % 11) - 5) * 0.0011,
    lng: base.lng + (((mix * 7) % 9) - 4) * 0.0014,
  };
}

async function reset(): Promise<void> {
  await prisma.event.deleteMany();
  await prisma.statDaily.deleteMany();
  await prisma.employerStatDaily.deleteMany();
  await prisma.marketSnapshotMonthly.deleteMany();
  await prisma.statsRun.deleteMany();
  await prisma.searchQueryStat.deleteMany();
  await prisma.aiUsage.deleteMany();
  await prisma.aiCache.deleteMany();
  await prisma.normalizationSample.deleteMany();
  await prisma.moderationDecision.deleteMany();
  await prisma.contactVerdict.deleteMany();
  await prisma.favorite.deleteMany();
  await prisma.application.deleteMany();
  await prisma.report.deleteMany();
  await prisma.parsedPost.deleteMany();
  await prisma.parserRun.deleteMany();
  await prisma.cityWaitlist.deleteMany();
  await prisma.geocodeCache.deleteMany();
  await prisma.telegramDelivery.deleteMany();
  await prisma.telegramUser.deleteMany();
  await prisma.vacancy.updateMany({
    data: { groupId: null, duplicateOfId: null, employerId: null },
  });
  await prisma.vacancyGroup.deleteMany();
  await prisma.vacancy.deleteMany();
  await prisma.employer.deleteMany();
  await prisma.profession.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();
}

async function main(): Promise<void> {
  const gorlovka = mustCity("gorlovka");
  const mariupol = mustCity("mariupol");
  const yanao = mustDestination("yanao");
  const moscow = mustDestination("moscow");

  const centr = mustDistrict(gorlovka, "centr");
  const nikitovka = mustDistrict(gorlovka, "nikitovka");
  const kalininskiy = mustDistrict(gorlovka, "kalininskiy");
  const golmovskiy = mustDistrict(gorlovka, "golmovskiy");
  const mayorsk = mustDistrict(gorlovka, "mayorsk");

  await reset();

  await prisma.category.createMany({
    data: [
      { slug: "stroitelstvo", name: "Строительство", icon: "hammer", order: 1 },
      { slug: "transport", name: "Транспорт", icon: "truck", order: 2 },
      { slug: "torgovlya", name: "Торговля", icon: "cart", order: 3 },
      { slug: "proizvodstvo", name: "Производство", icon: "factory", order: 4 },
      { slug: "meditsina", name: "Медицина", icon: "cross", order: 5 },
      { slug: "obrazovanie", name: "Образование", icon: "book", order: 6 },
      { slug: "obschepit", name: "Общепит", icon: "utensils", order: 7 },
      { slug: "bezopasnost", name: "Охрана", icon: "shield", order: 8 },
    ],
  });

  await prisma.profession.createMany({
    data: [
      {
        slug: "svarshchik",
        name: "Сварщик",
        sphere: "stroitelstvo",
        synonyms: ["сварной", "электросварщик", "газосварщик", "свар-к"],
      },
      {
        slug: "voditel-c",
        name: "Водитель категории C",
        sphere: "transport",
        synonyms: ["вод. кат. с", "водитель камаза", "водитель категории с"],
      },
      {
        slug: "prodavets",
        name: "Продавец",
        sphere: "torgovlya",
        synonyms: ["продавец-консультант", "кассир-продавец"],
      },
      {
        slug: "buhgalter",
        name: "Бухгалтер",
        sphere: "torgovlya",
        synonyms: ["главбух", "учётчик"],
      },
      {
        slug: "raznorabochiy",
        name: "Разнорабочий",
        sphere: "stroitelstvo",
        synonyms: ["подсобник", "разнорабочий на стройку"],
      },
      {
        slug: "medsestra",
        name: "Медсестра",
        sphere: "meditsina",
        synonyms: ["медбрат", "медицинская сестра"],
      },
      {
        slug: "uchitel-matematiki",
        name: "Учитель математики",
        sphere: "obrazovanie",
        synonyms: ["математик в школу", "учитель математики"],
      },
      {
        slug: "elektrik",
        name: "Электрик",
        sphere: "stroitelstvo",
        synonyms: ["электромонтёр", "электромонтажник"],
      },
      {
        slug: "povar",
        name: "Повар",
        sphere: "obschepit",
        synonyms: ["повар горячего цеха", "кашевар"],
      },
      {
        slug: "ohrannik",
        name: "Охранник",
        sphere: "bezopasnost",
        synonyms: ["сторож", "вахтёр"],
      },
      {
        slug: "operator-stanka",
        name: "Оператор станка",
        sphere: "proizvodstvo",
        synonyms: ["станочник", "оператор чпу"],
      },
      {
        slug: "kurer",
        name: "Курьер",
        sphere: "transport",
        synonyms: ["доставщик", "курьер пеший"],
      },
      {
        slug: "tokar",
        name: "Токарь",
        sphere: "proizvodstvo",
        synonyms: ["токарь-универсал"],
      },
      {
        slug: "shtukatur",
        name: "Штукатур",
        sphere: "stroitelstvo",
        synonyms: ["штукатур-маляр"],
      },
      {
        slug: "kladovshchik",
        name: "Кладовщик",
        sphere: "transport",
        synonyms: ["кладовщик-комплектовщик"],
      },
    ],
  });

  const mehzavod = await prisma.employer.create({
    data: {
      slug: "gorlovskiy-mehzavod",
      name: "ООО «Горловский механический завод»",
      description: "Местное производство. Проверенный работодатель: юрлицо, адрес и телефон совпадают.",
      citySlug: gorlovka.slug,
      sphere: "proizvodstvo",
      isVerified: true,
      phone: "+79491234501",
      website: "https://example.com/mehzavod",
      // Wikimedia принимает только стандартные ширины превью (40, не 64): https://w.wiki/GHai
      logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Example.svg/40px-Example.svg.png",
    },
  });

  const market = await prisma.employer.create({
    data: {
      slug: "magazin-tsentralny",
      name: "Магазин «Центральный»",
      description: "Продуктовая розница в центре города.",
      citySlug: gorlovka.slug,
      sphere: "torgovlya",
      isVerified: false,
      phone: "+79491234502",
      telegram: "central_market_hr",
      logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/40px-PNG_transparency_demonstration_1.png",
    },
  });

  const agency = await prisma.employer.create({
    data: {
      slug: "sever-nabor",
      name: "Кадровое агентство «Север-Набор»",
      description: "Набор на вахту. Посредник, не сам работодатель на объекте.",
      citySlug: gorlovka.slug,
      sphere: "stroitelstvo",
      isVerified: false,
      phone: "+79491234503",
      telegram: "sever_nabor",
      logoUrl: "https://upload.wikimedia.org/wikipedia/commons/missing-employer-logo.png",
    },
  });

  const svarshchikSections: Sections = {
    description: "Сварка металлоконструкций в цехе завода. Работа постоянная, местная.",
    tasks: ["Сварка по чертежам", "Подготовка стыков", "Сдача деталей ОТК"],
    requirements: ["Разряд не ниже 4", "Удостоверение сварщика", "Опыт от 1 года"],
    conditions: ["Официальное оформление", "Спецодежда", "Выплаты два раза в месяц"],
  };

  const voditelSections: Sections = {
    description: "Перевозка заготовок и готовой продукции по городу и ближайшим объектам.",
    tasks: ["Ежедневные рейсы по наряду", "Контроль состояния машины", "Отметки в путевом"],
    requirements: ["Категория C", "Стаж вождения от 3 лет", "Медсправка"],
    conditions: ["График 2/2", "ГСМ за счёт предприятия", "Ночная стоянка на территории"],
  };

  const prodavetsSections: Sections = {
    description: "Работа в продуктовом зале: выкладка, касса, общение с покупателями.",
    tasks: ["Приёмка и выкладка", "Касса", "Порядок в зале"],
    requirements: ["Опыт приветствуется, можно без опыта", "Вежливость", "Готовность к 2/2"],
    conditions: ["Скидка сотрудника", "Обед", "Оформление по договору"],
  };

  const buhgalterSections: Sections = {
    description: "Учёт в рознице: банк, касса, первичная документация, отчёты.",
    tasks: ["Первичка", "Зарплата и кадры малого штата", "Сверки с поставщиками"],
    requirements: ["1С:Бухгалтерия", "Опыт от 1 года", "Внимательность"],
    conditions: ["График 5/2", "Офис при магазине", "Оклад плюс премия"],
  };

  const vahtaYanaoSections: Sections = {
    description: "Сварка на объекте в Заполярье. Набор идёт из нашего города, работа — не здесь.",
    tasks: ["Сварка на площадке", "Соблюдение ТБ", "Вахтовая дисциплина"],
    requirements: ["Разряд от 5", "Готовность к вахте 60/30", "Медкомиссия"],
    conditions: ["Проживание и питание за счёт компании", "Проезд оплачивается", "Набор через агентство"],
  };

  const vacancies: Omit<Prisma.VacancyCreateManyInput, "sourcePostExternalId" | "splitIndex">[] = [
    {
      slug: "svarshchik-mehzavod-centr",
      title: "Сварщик",
      titleOriginal: "Требуется сварщик 4–5 разряда, цех",
      titleNormalized: "сварщик",
      rawText:
        "ООО Горловский механический завод приглашает сварщика 4–5 разряда. Цех, график 5/2, зарплата 45 000–60 000 руб. Опыт от года. Тел. 071 123-45-01.",
      description:
        "Сварка металлоконструкций в цехе. Разряд 4–5, работа постоянная. Оформление, спецодежда, выплаты два раза в месяц.",
      descriptionSections: svarshchikSections,
      summaryLine: `Сварщик · ${centr.name} · 45 000–60 000 ₽ · 5/2`,
      completeness: 92,
      qualityScore: 90,
      trustScore: 88,
      normalizerVersion: "seed-1",
      salaryFrom: 45000,
      salaryTo: 60000,
      salaryText: "45 000–60 000 ₽",
      salaryPeriod: SalaryPeriod.MONTH,
      citySlug: gorlovka.slug,
      districtSlug: centr.slug,
      address: "ул. Заводская, 12",
      latitude: pointForDistrict(gorlovka, centr.slug).lat,
      longitude: pointForDistrict(gorlovka, centr.slug).lng,
      workFormat: WorkFormat.LOCAL,
      sphere: "stroitelstvo",
      professionSlug: "svarshchik",
      schedule: "5/2",
      hoursPerDay: 8,
      experience: Experience.FROM_1_TO_3,
      employmentType: EmploymentType.FULL,
      contactPhone: "+79491234501",
      source: Source.WEBSITE,
      sourceName: "Сайт завода",
      sourceUrl: "https://example.com/mehzavod/jobs/weld",
      externalId: "seed-001",
      contentHash: contentHash("svarshchik-mehzavod-centr"),
      signature: signature({
        professionSlug: "svarshchik",
        workFormat: WorkFormat.LOCAL,
        workLocation: gorlovka.slug,
        salaryFrom: 45000,
        rotation: null,
      }),
      moderationStatus: ModerationStatus.AUTO_OK,
      publishedAt: daysAgo(1),
      employerId: mehzavod.id,
      viewsCount: 18,
    },
    {
      slug: "voditel-c-mehzavod-nikitovka",
      title: "Водитель категории C",
      titleOriginal: "Водитель кат. C, свой КамАЗ предприятия",
      titleNormalized: "водитель категории c",
      rawText:
        "Ищем водителя категории C. График 2 через 2. Зарплата от 50 000. Машина предприятия. Район Никитовка.",
      description:
        "Перевозка грузов по городу на машине предприятия. Категория C, стаж от 3 лет, график 2/2.",
      descriptionSections: voditelSections,
      summaryLine: `Водитель категории C · ${nikitovka.name} · от 50 000 ₽ · 2/2`,
      completeness: 88,
      qualityScore: 86,
      trustScore: 84,
      normalizerVersion: "seed-1",
      salaryFrom: 50000,
      salaryTo: null,
      salaryText: "от 50 000 ₽",
      salaryPeriod: SalaryPeriod.MONTH,
      citySlug: gorlovka.slug,
      districtSlug: nikitovka.slug,
      address: "Никитовское шоссе, 4",
      latitude: pointForDistrict(gorlovka, nikitovka.slug).lat,
      longitude: pointForDistrict(gorlovka, nikitovka.slug).lng,
      workFormat: WorkFormat.LOCAL,
      sphere: "transport",
      professionSlug: "voditel-c",
      schedule: "2/2",
      hoursPerDay: 11,
      experience: Experience.FROM_3,
      employmentType: EmploymentType.SHIFT,
      contactPhone: "+79491234501",
      source: Source.MANUAL,
      sourceName: "Размещено работодателем",
      externalId: "seed-002",
      contentHash: contentHash("voditel-c-mehzavod-nikitovka"),
      signature: signature({
        professionSlug: "voditel-c",
        workFormat: WorkFormat.LOCAL,
        workLocation: gorlovka.slug,
        salaryFrom: 50000,
        rotation: null,
      }),
      moderationStatus: ModerationStatus.AUTO_OK,
      publishedAt: daysAgo(2),
      employerId: mehzavod.id,
      viewsCount: 11,
    },
    {
      slug: "prodavets-tsentralny-centr",
      title: "Продавец",
      titleOriginal: "Продавец-консультант в прод Mag",
      titleNormalized: "продавец",
      rawText:
        "Магазин Центральный. Нужен продавец в зал. 25–35 тыс, график 2/2. Центр, рядом с рынком.",
      description:
        "Продавец в продуктовый зал: выкладка, касса, покупатели. График 2/2, можно без опыта.",
      descriptionSections: prodavetsSections,
      summaryLine: `Продавец · ${centr.name} · 25 000–35 000 ₽ · 2/2`,
      completeness: 90,
      qualityScore: 87,
      trustScore: 70,
      normalizerVersion: "seed-1",
      salaryFrom: 25000,
      salaryTo: 35000,
      salaryText: "25 000–35 000 ₽",
      salaryPeriod: SalaryPeriod.MONTH,
      citySlug: gorlovka.slug,
      districtSlug: centr.slug,
      address: "пр. Ленина, 8",
      latitude: pointForDistrict(gorlovka, centr.slug).lat,
      longitude: pointForDistrict(gorlovka, centr.slug).lng,
      workFormat: WorkFormat.LOCAL,
      sphere: "torgovlya",
      professionSlug: "prodavets",
      schedule: "2/2",
      hoursPerDay: 12,
      experience: Experience.NONE,
      employmentType: EmploymentType.SHIFT,
      contactPhone: "+79491234502",
      contactTelegram: "central_market_hr",
      source: Source.VK,
      sourceName: "Работа Горловка | ВК",
      sourceUrl: "https://vk.com/wall-100001_1",
      externalId: "seed-003",
      contentHash: contentHash("prodavets-tsentralny-centr"),
      signature: signature({
        professionSlug: "prodavets",
        workFormat: WorkFormat.LOCAL,
        workLocation: gorlovka.slug,
        salaryFrom: 25000,
        rotation: null,
      }),
      moderationStatus: ModerationStatus.AUTO_OK,
      publishedAt: daysAgo(3),
      employerId: market.id,
      viewsCount: 24,
    },
    {
      slug: "buhgalter-tsentralny-kalininskiy",
      title: "Бухгалтер",
      titleOriginal: "Бухгалтер на первичку, 1С",
      titleNormalized: "бухгалтер",
      rawText:
        "Ищем бухгалтера. Зарплата до 45 000. 5/2, Калининский район. 1С обязательно.",
      description:
        "Бухгалтер в рознице: первичка, касса, зарплата небольшого штата. График 5/2, 1С.",
      descriptionSections: buhgalterSections,
      summaryLine: `Бухгалтер · ${kalininskiy.name} · до 45 000 ₽ · 5/2`,
      completeness: 86,
      qualityScore: 84,
      trustScore: 72,
      normalizerVersion: "seed-1",
      salaryFrom: null,
      salaryTo: 45000,
      salaryText: "до 45 000 ₽",
      salaryPeriod: SalaryPeriod.MONTH,
      citySlug: gorlovka.slug,
      districtSlug: kalininskiy.slug,
      address: "ул. Калинина, 21",
      latitude: pointForDistrict(gorlovka, kalininskiy.slug).lat,
      longitude: pointForDistrict(gorlovka, kalininskiy.slug).lng,
      workFormat: WorkFormat.LOCAL,
      sphere: "torgovlya",
      professionSlug: "buhgalter",
      schedule: "5/2",
      hoursPerDay: 8,
      experience: Experience.FROM_1_TO_3,
      employmentType: EmploymentType.FULL,
      contactPhone: "+79491234502",
      source: Source.WEBSITE,
      sourceName: "Объявление работодателя",
      sourceUrl: "https://example.com/market/buh",
      externalId: "seed-004",
      contentHash: contentHash("buhgalter-tsentralny-kalininskiy"),
      signature: signature({
        professionSlug: "buhgalter",
        workFormat: WorkFormat.LOCAL,
        workLocation: gorlovka.slug,
        salaryFrom: null,
        rotation: null,
      }),
      moderationStatus: ModerationStatus.AUTO_OK,
      publishedAt: daysAgo(4),
      employerId: market.id,
      viewsCount: 9,
    },
    {
      slug: "raznorabochiy-mehzavod-golmovskiy",
      title: "Разнорабочий",
      titleOriginal: "Подсобник на площадку, Гольма",
      titleNormalized: "разнорабочий",
      rawText:
        "Нужны разнорабочие. Гольмовский. ЗП 30–35 тыс. График 6/1. Пишите.",
      description: "Подсобные работы на площадке: разгрузка, уборка, помощь бригаде. График 6/1.",
      summaryLine: `Разнорабочий · ${golmovskiy.name} · 30 000–35 000 ₽ · 6/1`,
      completeness: 64,
      qualityScore: 60,
      trustScore: 74,
      normalizerVersion: "seed-1",
      salaryFrom: 30000,
      salaryTo: 35000,
      salaryText: "30 000–35 000 ₽",
      salaryPeriod: SalaryPeriod.MONTH,
      citySlug: gorlovka.slug,
      districtSlug: golmovskiy.slug,
      address: "пос. Гольмовский, промзона",
      latitude: pointForDistrict(gorlovka, golmovskiy.slug).lat,
      longitude: pointForDistrict(gorlovka, golmovskiy.slug).lng,
      workFormat: WorkFormat.LOCAL,
      sphere: "stroitelstvo",
      professionSlug: "raznorabochiy",
      schedule: "6/1",
      hoursPerDay: 9,
      experience: Experience.NONE,
      employmentType: EmploymentType.FULL,
      contactPhone: "+79491234501",
      source: Source.TELEGRAM,
      sourceName: "Вакансии Горловка | Telegram",
      sourceUrl: "https://t.me/jobs_example/10",
      externalId: "seed-005",
      contentHash: contentHash("raznorabochiy-mehzavod-golmovskiy"),
      signature: signature({
        professionSlug: "raznorabochiy",
        workFormat: WorkFormat.LOCAL,
        workLocation: gorlovka.slug,
        salaryFrom: 30000,
        rotation: null,
      }),
      moderationStatus: ModerationStatus.AUTO_OK,
      publishedAt: daysAgo(5),
      employerId: mehzavod.id,
      viewsCount: 7,
    },
    {
      slug: "medsestra-nikitovka",
      title: "Медсестра",
      titleOriginal: "Медсестра в кабинет, Никитовка",
      titleNormalized: "медсестра",
      rawText:
        "Требуется медсестра. Никитовка. От 38 000. График 5/2. Сертификат обязателен.",
      description: "Процедурный кабинет: уколы, заполнение журналов, помощь врачу. График 5/2.",
      summaryLine: `Медсестра · ${nikitovka.name} · от 38 000 ₽ · 5/2`,
      completeness: 58,
      qualityScore: 55,
      trustScore: 68,
      normalizerVersion: "seed-1",
      salaryFrom: 38000,
      salaryTo: null,
      salaryText: "от 38 000 ₽",
      salaryPeriod: SalaryPeriod.MONTH,
      citySlug: gorlovka.slug,
      districtSlug: nikitovka.slug,
      latitude: pointForDistrict(gorlovka, nikitovka.slug).lat,
      longitude: pointForDistrict(gorlovka, nikitovka.slug).lng,
      workFormat: WorkFormat.LOCAL,
      sphere: "meditsina",
      professionSlug: "medsestra",
      schedule: "5/2",
      hoursPerDay: 8,
      experience: Experience.FROM_1_TO_3,
      employmentType: EmploymentType.FULL,
      contactPhone: "+79491234510",
      source: Source.VK,
      sourceName: "Работа Горловка | ВК",
      sourceUrl: "https://vk.com/wall-100001_6",
      externalId: "seed-006",
      contentHash: contentHash("medsestra-nikitovka"),
      signature: signature({
        professionSlug: "medsestra",
        workFormat: WorkFormat.LOCAL,
        workLocation: gorlovka.slug,
        salaryFrom: 38000,
        rotation: null,
      }),
      moderationStatus: ModerationStatus.AUTO_OK,
      publishedAt: daysAgo(6),
      viewsCount: 5,
    },
    {
      slug: "uchitel-matematiki-mayorsk",
      title: "Учитель математики",
      titleOriginal: "Учитель математики в школу, Майорск",
      titleNormalized: "учитель математики",
      rawText:
        "Школа, пос. Майорск. Нужен учитель математики. Зарплату обсудим на собеседовании. 5/2.",
      description: "Преподавание математики в школе. Ставка и нагрузка — на собеседовании. График 5/2.",
      summaryLine: `Учитель математики · ${mayorsk.name} · 5/2`,
      completeness: 52,
      qualityScore: 50,
      trustScore: 66,
      normalizerVersion: "seed-1",
      salaryFrom: null,
      salaryTo: null,
      salaryText: null,
      salaryPeriod: SalaryPeriod.MONTH,
      citySlug: gorlovka.slug,
      districtSlug: mayorsk.slug,
      latitude: pointForDistrict(gorlovka, mayorsk.slug).lat,
      longitude: pointForDistrict(gorlovka, mayorsk.slug).lng,
      workFormat: WorkFormat.LOCAL,
      sphere: "obrazovanie",
      professionSlug: "uchitel-matematiki",
      schedule: "5/2",
      hoursPerDay: 6,
      experience: Experience.FROM_1_TO_3,
      employmentType: EmploymentType.FULL,
      contactPhone: "+79491234511",
      source: Source.TELEGRAM,
      sourceName: "Вакансии Горловка | Telegram",
      sourceUrl: "https://t.me/jobs_example/22",
      externalId: "seed-007",
      contentHash: contentHash("uchitel-matematiki-mayorsk"),
      signature: signature({
        professionSlug: "uchitel-matematiki",
        workFormat: WorkFormat.LOCAL,
        workLocation: gorlovka.slug,
        salaryFrom: null,
        rotation: null,
      }),
      moderationStatus: ModerationStatus.AUTO_OK,
      publishedAt: daysAgo(7),
      viewsCount: 4,
    },
    {
      slug: "elektrik-mehzavod-kalininskiy",
      title: "Электрик",
      titleOriginal: "Электромонтёр на завод",
      titleNormalized: "электрик",
      rawText:
        "Электрик / электромонтёр. Калининский. От 40 тысяч. 5/2. Допуск по электробезопасности.",
      description: "Обслуживание электросетей цеха: ремонт, обходы, мелкий монтаж. График 5/2.",
      summaryLine: `Электрик · ${kalininskiy.name} · от 40 000 ₽ · 5/2`,
      completeness: 66,
      qualityScore: 63,
      trustScore: 80,
      normalizerVersion: "seed-1",
      salaryFrom: 40000,
      salaryTo: null,
      salaryText: "от 40 000 ₽",
      salaryPeriod: SalaryPeriod.MONTH,
      citySlug: gorlovka.slug,
      districtSlug: kalininskiy.slug,
      latitude: pointForDistrict(gorlovka, kalininskiy.slug).lat,
      longitude: pointForDistrict(gorlovka, kalininskiy.slug).lng,
      workFormat: WorkFormat.LOCAL,
      sphere: "stroitelstvo",
      professionSlug: "elektrik",
      schedule: "5/2",
      hoursPerDay: 8,
      experience: Experience.FROM_1_TO_3,
      employmentType: EmploymentType.FULL,
      contactPhone: "+79491234501",
      source: Source.WEBSITE,
      sourceName: "Сайт завода",
      sourceUrl: "https://example.com/mehzavod/jobs/elec",
      externalId: "seed-008",
      contentHash: contentHash("elektrik-mehzavod-kalininskiy"),
      signature: signature({
        professionSlug: "elektrik",
        workFormat: WorkFormat.LOCAL,
        workLocation: gorlovka.slug,
        salaryFrom: 40000,
        rotation: null,
      }),
      moderationStatus: ModerationStatus.AUTO_OK,
      publishedAt: daysAgo(8),
      employerId: mehzavod.id,
      viewsCount: 6,
    },
    {
      slug: "povar-vk-nikitovka",
      title: "Повар",
      titleOriginal: "СРОЧНО!!! 🔥 НУЖЕН ПОВАР ЗА СМЕНУ",
      titleNormalized: "повар",
      rawText:
        "СРОЧНО!!! 🔥🔥 НУЖЕН ПОВАР НА КАФЕ НИКИТОВКА ЗП 1500 ЗА СМЕНУ ЗВОНИТЬ 071-123-45-20 ПОДПИСЫВАЙТЕСЬ НА ГРУППУ!!!!",
      description: "Повар в кафе. <script>alert('xss')</script> Оплата за смену. <b>Звонить срочно</b>.",
      summaryLine: `Повар · ${nikitovka.name} · 1 500 ₽/смена`,
      completeness: 28,
      qualityScore: 24,
      trustScore: 48,
      normalizerVersion: "seed-1",
      salaryFrom: 1500,
      salaryTo: 1500,
      salaryText: "1 500 ₽ за смену",
      salaryPeriod: SalaryPeriod.SHIFT,
      citySlug: gorlovka.slug,
      districtSlug: nikitovka.slug,
      latitude: pointForDistrict(gorlovka, nikitovka.slug).lat,
      longitude: pointForDistrict(gorlovka, nikitovka.slug).lng,
      workFormat: WorkFormat.LOCAL,
      sphere: "obschepit",
      professionSlug: "povar",
      schedule: "сменный",
      contactPhone: "+79491234520",
      source: Source.VK,
      sourceName: "Работа Горловка | ВК",
      sourceUrl: "https://vk.com/wall-100001_9",
      externalId: "seed-009",
      contentHash: contentHash("povar-vk-nikitovka"),
      signature: signature({
        professionSlug: "povar",
        workFormat: WorkFormat.LOCAL,
        workLocation: gorlovka.slug,
        salaryFrom: 1500,
        rotation: null,
      }),
      moderationStatus: ModerationStatus.AUTO_OK,
      publishedAt: daysAgo(1),
      employerId: market.id,
      viewsCount: 31,
      needsHumanReview: true,
    },
    {
      slug: "ohrannik-vk-centr",
      title: "Охранник",
      titleOriginal: "ОХРАНА ТЦ СРОЧНО",
      titleNormalized: "охранник",
      rawText: "ОХРАНА ТЦ ЦЕНТР ОТ 28К ГРАФИК 2/2 ПИСАТЬ В ЛС БЕЗ ОПЫТА МОЖНО",
      description: "Охрана торгового центра. График 2/2.",
      summaryLine: `Охранник · ${centr.name} · от 28 000 ₽ · 2/2`,
      completeness: 32,
      qualityScore: 30,
      trustScore: 44,
      normalizerVersion: "seed-1",
      salaryFrom: 28000,
      salaryTo: null,
      salaryText: "от 28 000",
      salaryPeriod: SalaryPeriod.MONTH,
      citySlug: gorlovka.slug,
      districtSlug: centr.slug,
      latitude: pointForDistrict(gorlovka, centr.slug).lat,
      longitude: pointForDistrict(gorlovka, centr.slug).lng,
      workFormat: WorkFormat.LOCAL,
      sphere: "bezopasnost",
      professionSlug: "ohrannik",
      schedule: "2/2",
      experience: Experience.NONE,
      contactPhone: "+79491234521",
      source: Source.VK,
      sourceName: "Работа Горловка | ВК",
      sourceUrl: "https://vk.com/wall-100001_10",
      externalId: "seed-010",
      contentHash: contentHash("ohrannik-vk-centr"),
      signature: signature({
        professionSlug: "ohrannik",
        workFormat: WorkFormat.LOCAL,
        workLocation: gorlovka.slug,
        salaryFrom: 28000,
        rotation: null,
      }),
      moderationStatus: ModerationStatus.AUTO_OK,
      publishedAt: daysAgo(2),
      viewsCount: 14,
    },
    {
      slug: "operator-stanka-vk-golmovskiy",
      title: "Оператор станка",
      titleOriginal: "станочник гольма зп норм",
      titleNormalized: "оператор станка",
      rawText: "станочник нужен гольмовский зп от 42 тыс звоните сами разберёмся",
      description: "Оператор станка. Оплата от 42 000 ₽.",
      summaryLine: `Оператор станка · ${golmovskiy.name} · от 42 000 ₽`,
      completeness: 26,
      qualityScore: 22,
      trustScore: 50,
      normalizerVersion: "seed-1",
      salaryFrom: 42000,
      salaryTo: null,
      salaryText: "от 42 000",
      salaryPeriod: SalaryPeriod.MONTH,
      citySlug: gorlovka.slug,
      districtSlug: golmovskiy.slug,
      latitude: pointForDistrict(gorlovka, golmovskiy.slug).lat,
      longitude: pointForDistrict(gorlovka, golmovskiy.slug).lng,
      workFormat: WorkFormat.LOCAL,
      sphere: "proizvodstvo",
      professionSlug: "operator-stanka",
      contactPhone: "+79491234501",
      source: Source.VK,
      sourceName: "Работа Горловка | ВК",
      sourceUrl: "https://vk.com/wall-100001_11",
      externalId: "seed-011",
      contentHash: contentHash("operator-stanka-vk-golmovskiy"),
      signature: signature({
        professionSlug: "operator-stanka",
        workFormat: WorkFormat.LOCAL,
        workLocation: gorlovka.slug,
        salaryFrom: 42000,
        rotation: null,
      }),
      moderationStatus: ModerationStatus.AUTO_OK,
      publishedAt: daysAgo(9),
      employerId: mehzavod.id,
      viewsCount: 3,
    },
    {
      slug: "kurer-vk-mayorsk",
      title: "Курьер",
      titleOriginal: "КУРЬЕР МАЙОРСК ЗП ДОГОВОРНАЯ",
      titleNormalized: "курьер",
      rawText: "курьер пеший майорск зп договорная свой тел 0711234522 пишите сразу",
      description: "Курьер. Зарплата по договорённости.",
      summaryLine: `Курьер · ${mayorsk.name}`,
      completeness: 22,
      qualityScore: 18,
      trustScore: 40,
      normalizerVersion: "seed-1",
      salaryFrom: null,
      salaryTo: null,
      salaryText: null,
      salaryPeriod: SalaryPeriod.MONTH,
      citySlug: gorlovka.slug,
      districtSlug: mayorsk.slug,
      latitude: pointForDistrict(gorlovka, mayorsk.slug).lat,
      longitude: pointForDistrict(gorlovka, mayorsk.slug).lng,
      workFormat: WorkFormat.LOCAL,
      sphere: "transport",
      professionSlug: "kurer",
      schedule: "гибкий",
      contactPhone: "+79491234522",
      source: Source.VK,
      sourceName: "Работа Горловка | ВК",
      sourceUrl: "https://vk.com/wall-100001_12",
      externalId: "seed-012",
      contentHash: contentHash("kurer-vk-mayorsk"),
      signature: signature({
        professionSlug: "kurer",
        workFormat: WorkFormat.LOCAL,
        workLocation: gorlovka.slug,
        salaryFrom: null,
        rotation: null,
      }),
      moderationStatus: ModerationStatus.AUTO_OK,
      publishedAt: daysAgo(3),
      employerId: market.id,
      viewsCount: 8,
    },
    {
      slug: "svarshchik-vahta-yanao",
      title: "Сварщик",
      titleOriginal: "Сварщики на Ямал 60/30 проживание питание",
      titleNormalized: "сварщик",
      rawText: `Сварщики на вахту, ${yanao.name}, Новый Уренгой. 60/30. 180 000 за вахту. Проживание и питание, проезд. Набор из ${gorlovka.name.gen}. Агентство.`,
      description: `Сварка на объекте. Набор из ${gorlovka.name.gen}, работа в направлении «${yanao.name}». Схема 60/30, проживание и питание, проезд.`,
      descriptionSections: vahtaYanaoSections,
      summaryLine: `Сварщик · вахта · ${yanao.name} · 180 000 ₽ · 60/30`,
      completeness: 84,
      qualityScore: 80,
      trustScore: 46,
      trustFlags: [{ rule: "agency_vahta", weight: 20 }],
      normalizerVersion: "seed-1",
      salaryFrom: 180000,
      salaryTo: 180000,
      salaryText: "180 000 ₽ за вахту",
      salaryPeriod: SalaryPeriod.MONTH,
      citySlug: gorlovka.slug,
      districtSlug: centr.slug,
      latitude: gorlovka.center.lat,
      longitude: gorlovka.center.lng,
      workFormat: WorkFormat.VAHTA,
      workLocationText: `${yanao.name}, Новый Уренгой`,
      workCitySlug: yanao.slug,
      rotationPattern: "60/30",
      vahtaDays: 60,
      housingProvided: true,
      mealsProvided: true,
      travelPaid: true,
      advancePayment: false,
      employerKind: EmployerKind.AGENCY,
      sphere: "stroitelstvo",
      professionSlug: "svarshchik",
      hoursPerDay: 11,
      experience: Experience.FROM_3,
      employmentType: EmploymentType.TEMPORARY,
      contactPhone: "+79491234503",
      contactTelegram: "sever_nabor",
      source: Source.VK,
      sourceName: "Работа Горловка | ВК",
      sourceUrl: "https://vk.com/wall-100001_13",
      externalId: "seed-013",
      contentHash: contentHash("svarshchik-vahta-yanao"),
      signature: signature({
        professionSlug: "svarshchik",
        workFormat: WorkFormat.VAHTA,
        workLocation: yanao.slug,
        salaryFrom: 180000,
        rotation: "60/30",
      }),
      moderationStatus: ModerationStatus.AUTO_OK,
      publishedAt: daysAgo(2),
      employerId: agency.id,
      viewsCount: 40,
    },
    {
      slug: "voditel-c-vahta-moscow",
      title: "Водитель категории C",
      titleOriginal: "Водители на вахту Москва 45/45",
      titleNormalized: "водитель категории c",
      rawText: `Водители кат. C на вахту, ${moscow.name}. 45/45. Жильё есть, проезд, аванс. ЗП от 120 000.`,
      description: `Вахта, место работы: ${moscow.name}. Схема 45/45, проживание и проезд, аванс. Набор из ${gorlovka.name.gen}.`,
      summaryLine: `Водитель категории C · вахта · ${moscow.name} · от 120 000 ₽ · 45/45`,
      completeness: 61,
      qualityScore: 58,
      trustScore: 44,
      trustFlags: [{ rule: "agency_vahta", weight: 20 }],
      normalizerVersion: "seed-1",
      salaryFrom: 120000,
      salaryTo: null,
      salaryText: "от 120 000 ₽",
      salaryPeriod: SalaryPeriod.MONTH,
      citySlug: gorlovka.slug,
      districtSlug: nikitovka.slug,
      latitude: gorlovka.center.lat,
      longitude: gorlovka.center.lng,
      workFormat: WorkFormat.VAHTA,
      workLocationText: moscow.name,
      workCitySlug: moscow.slug,
      rotationPattern: "45/45",
      vahtaDays: 45,
      housingProvided: true,
      mealsProvided: false,
      travelPaid: true,
      advancePayment: true,
      employerKind: EmployerKind.AGENCY,
      sphere: "transport",
      professionSlug: "voditel-c",
      hoursPerDay: 11,
      experience: Experience.FROM_3,
      employmentType: EmploymentType.TEMPORARY,
      contactPhone: "+79491234503",
      source: Source.TELEGRAM,
      sourceName: "Вакансии Горловка | Telegram",
      sourceUrl: "https://t.me/jobs_example/45",
      externalId: "seed-014",
      contentHash: contentHash("voditel-c-vahta-moscow"),
      signature: signature({
        professionSlug: "voditel-c",
        workFormat: WorkFormat.VAHTA,
        workLocation: moscow.slug,
        salaryFrom: 120000,
        rotation: "45/45",
      }),
      moderationStatus: ModerationStatus.AUTO_OK,
      publishedAt: daysAgo(4),
      employerId: agency.id,
      viewsCount: 22,
    },
    {
      slug: "raznorabochiy-vahta-mariupol",
      title: "Разнорабочий",
      titleOriginal: "ВАХТА ВОССТАНОВЛЕНИЕ 30/15 ЖИЛЬЁ",
      titleNormalized: "разнорабочий",
      rawText: `вахта восстановление ${mariupol.name.gen} 30/15 жильё питание проезд напрямую от завода зп 80-100к`,
      description: `Вахта на восстановлении. Место работы — ${mariupol.name.nom}. Схема 30/15.`,
      summaryLine: `Разнорабочий · вахта · ${mariupol.name.nom} · 80 000–100 000 ₽ · 30/15`,
      completeness: 34,
      qualityScore: 32,
      trustScore: 62,
      normalizerVersion: "seed-1",
      salaryFrom: 80000,
      salaryTo: 100000,
      salaryText: "80 000–100 000 ₽",
      salaryPeriod: SalaryPeriod.MONTH,
      citySlug: gorlovka.slug,
      districtSlug: golmovskiy.slug,
      latitude: mariupol.center.lat,
      longitude: mariupol.center.lng,
      workFormat: WorkFormat.VAHTA,
      workLocationText: `восстановление, ${mariupol.name.nom}`,
      workCitySlug: mariupol.slug,
      rotationPattern: "30/15",
      vahtaDays: 30,
      housingProvided: true,
      mealsProvided: true,
      travelPaid: true,
      advancePayment: false,
      employerKind: EmployerKind.DIRECT,
      sphere: "stroitelstvo",
      professionSlug: "raznorabochiy",
      hoursPerDay: 10,
      employmentType: EmploymentType.TEMPORARY,
      contactPhone: "+79491234501",
      source: Source.VK,
      sourceName: "Работа Горловка | ВК",
      sourceUrl: "https://vk.com/wall-100001_15",
      externalId: "seed-015",
      contentHash: contentHash("raznorabochiy-vahta-mariupol"),
      signature: signature({
        professionSlug: "raznorabochiy",
        workFormat: WorkFormat.VAHTA,
        workLocation: mariupol.slug,
        salaryFrom: 80000,
        rotation: "30/15",
      }),
      moderationStatus: ModerationStatus.AUTO_OK,
      publishedAt: daysAgo(5),
      employerId: mehzavod.id,
      viewsCount: 16,
    },
  ];

  const overlong = vacancies.filter((row) => row.description.length > 3000);
  if (overlong.length > 0) {
    throw new Error(`Описание длиннее 3000 символов: ${overlong.map((row) => row.slug).join(", ")}`);
  }

  await prisma.vacancy.createMany({
    data: vacancies.map((row) => ({
      ...row,
      splitIndex: 0,
      sourcePostExternalId: row.externalId,
    })),
  });

  const seedPhones = [...new Set(vacancies.map((row) => row.contactPhone).filter((item): item is string => Boolean(item)))];
  if (seedPhones.length > 0) {
    await prisma.contactVerdict.createMany({
      data: seedPhones.map((contact) => ({
        contact,
        verdict: ContactVerdictKind.TRUSTED,
        reason: "seed: работодатель из сидов уже на сайте",
        vacanciesCount: vacancies.filter((row) => row.contactPhone === contact).length,
      })),
    });
  }

  await prisma.vacancy.updateMany({
    where: { workFormat: WorkFormat.LOCAL },
    data: { geocodeAccuracy: GeocodeAccuracy.DISTRICT },
  });
  await prisma.vacancy.updateMany({
    where: { workFormat: WorkFormat.VAHTA },
    data: { geocodeAccuracy: GeocodeAccuracy.CITY },
  });

  const mapped = await prisma.vacancy.findMany({
    select: {
      address: true,
      citySlug: true,
      districtSlug: true,
      latitude: true,
      longitude: true,
      geocodeAccuracy: true,
    },
  });
  const cityBySlug = new Map(geoJson.cities.map((item) => [item.slug, item]));
  for (const row of mapped) {
    if (row.latitude == null || row.longitude == null) {
      continue;
    }
    const cityMeta = cityBySlug.get(row.citySlug);
    if (!cityMeta) {
      continue;
    }
    const districtMeta = cityMeta.districts.find((item) => item.slug === row.districtSlug);
    const query = buildGeocodeQuery({
      cityName: cityMeta.name.nom,
      address: row.address,
      districtName: districtMeta?.name ?? null,
    });
    await prisma.geocodeCache.upsert({
      where: { query },
      create: {
        query,
        lat: row.latitude,
        lng: row.longitude,
        accuracy: row.geocodeAccuracy ?? GeocodeAccuracy.CITY,
        provider: "seed",
      },
      update: {},
    });
  }

  const { recomputeVacancyCounts } = await import("../src/lib/hygiene/counters");
  await recomputeVacancyCounts();

  const counts = {
    vacancies: await prisma.vacancy.count(),
    local: await prisma.vacancy.count({ where: { workFormat: WorkFormat.LOCAL } }),
    vahta: await prisma.vacancy.count({ where: { workFormat: WorkFormat.VAHTA } }),
    employers: await prisma.employer.count(),
    categories: await prisma.category.count(),
    professions: await prisma.profession.count(),
    noSalary: await prisma.vacancy.count({ where: { salaryFrom: null, salaryTo: null } }),
    shiftPay: await prisma.vacancy.count({ where: { salaryPeriod: SalaryPeriod.SHIFT } }),
  };

  console.log("Сиды записаны:");
  console.log(`  вакансий: ${counts.vacancies} (местных ${counts.local}, вахт ${counts.vahta})`);
  console.log(`  работодателей: ${counts.employers}`);
  console.log(`  сфер: ${counts.categories}`);
  console.log(`  профессий: ${counts.professions}`);
  console.log(`  без зарплаты: ${counts.noSalary}`);
  console.log(`  оплата за смену: ${counts.shiftPay}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
