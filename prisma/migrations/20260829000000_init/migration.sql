-- CreateEnum
CREATE TYPE "SalaryPeriod" AS ENUM ('MONTH', 'SHIFT', 'HOUR', 'PIECE');

-- CreateEnum
CREATE TYPE "WorkFormat" AS ENUM ('LOCAL', 'VAHTA', 'REMOTE');

-- CreateEnum
CREATE TYPE "EmployerKind" AS ENUM ('DIRECT', 'AGENCY', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "Experience" AS ENUM ('NONE', 'UP_TO_1', 'FROM_1_TO_3', 'FROM_3');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL', 'PART', 'SHIFT', 'TEMPORARY', 'REMOTE');

-- CreateEnum
CREATE TYPE "Source" AS ENUM ('VK', 'TELEGRAM', 'WEBSITE', 'MANUAL', 'EMPLOYER');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('AUTO_OK', 'PENDING', 'APPROVED', 'REJECTED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SEEKER', 'EMPLOYER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('SENT', 'VIEWED', 'INVITED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ParsedPostStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('NEW', 'REVIEWED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('VACANCY_VIEW', 'VACANCY_LIST', 'SEARCH', 'FILTER_APPLY', 'APPLY_START', 'APPLY_SENT', 'FAVORITE_ADD', 'CONTACT_CLICK', 'MAP_OPEN', 'SOURCE_CLICK');

-- CreateEnum
CREATE TYPE "DeviceClass" AS ENUM ('MOBILE', 'DESKTOP');

-- CreateEnum
CREATE TYPE "ContactVerdictKind" AS ENUM ('TRUSTED', 'BLOCKED');

-- CreateTable
CREATE TABLE "Vacancy" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleOriginal" TEXT,
    "titleNormalized" TEXT NOT NULL,
    "rawText" TEXT,
    "description" VARCHAR(3000) NOT NULL,
    "descriptionSections" JSONB,
    "summaryLine" TEXT,
    "completeness" INTEGER NOT NULL DEFAULT 0,
    "normalizerVersion" TEXT NOT NULL,
    "aiProcessed" BOOLEAN NOT NULL DEFAULT false,
    "aiModel" TEXT,
    "aiPromptVersion" TEXT,
    "aiConfidence" INTEGER,
    "needsAiReview" BOOLEAN NOT NULL DEFAULT false,
    "needsHumanReview" BOOLEAN NOT NULL DEFAULT false,
    "salaryFrom" INTEGER,
    "salaryTo" INTEGER,
    "salaryText" TEXT,
    "salaryCurrency" TEXT NOT NULL DEFAULT 'RUB',
    "salaryPeriod" "SalaryPeriod" NOT NULL DEFAULT 'MONTH',
    "citySlug" TEXT NOT NULL,
    "districtSlug" TEXT,
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "workFormat" "WorkFormat" NOT NULL DEFAULT 'LOCAL',
    "workLocationText" TEXT,
    "workCitySlug" TEXT,
    "rotationPattern" TEXT,
    "vahtaDays" INTEGER,
    "housingProvided" BOOLEAN NOT NULL DEFAULT false,
    "mealsProvided" BOOLEAN NOT NULL DEFAULT false,
    "travelPaid" BOOLEAN NOT NULL DEFAULT false,
    "advancePayment" BOOLEAN NOT NULL DEFAULT false,
    "employerKind" "EmployerKind" NOT NULL DEFAULT 'UNKNOWN',
    "sphere" TEXT NOT NULL,
    "professionSlug" TEXT,
    "schedule" TEXT,
    "hoursPerDay" INTEGER,
    "experience" "Experience",
    "employmentType" "EmploymentType",
    "contactPhone" TEXT,
    "contactTelegram" TEXT,
    "contactEmail" TEXT,
    "source" "Source" NOT NULL,
    "sourceName" TEXT,
    "sourceUrl" TEXT,
    "externalId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "duplicateOfId" TEXT,
    "signature" TEXT NOT NULL,
    "groupId" TEXT,
    "qualityScore" INTEGER NOT NULL DEFAULT 0,
    "trustScore" INTEGER NOT NULL DEFAULT 0,
    "trustFlags" JSONB NOT NULL DEFAULT '[]',
    "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewsCount" INTEGER NOT NULL DEFAULT 0,
    "employerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vacancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employer" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "citySlug" TEXT NOT NULL,
    "sphere" TEXT NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "logoUrl" TEXT,
    "phone" TEXT,
    "telegram" TEXT,
    "email" TEXT,
    "website" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "vacancyCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profession" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sphere" TEXT NOT NULL,
    "synonyms" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "Profession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'SEEKER',
    "phone" TEXT,
    "citySlug" TEXT NOT NULL,
    "preferredMode" TEXT NOT NULL DEFAULT 'lite',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vacancyId" TEXT NOT NULL,
    "message" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'SENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vacancyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramUser" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "citySlug" TEXT NOT NULL,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "spheres" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParsedPost" (
    "id" TEXT NOT NULL,
    "source" "Source" NOT NULL,
    "externalId" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "detectedCity" TEXT,
    "filterScore" INTEGER NOT NULL,
    "filterReasons" JSONB NOT NULL,
    "status" "ParsedPostStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParsedPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParserRun" (
    "id" TEXT NOT NULL,
    "parser" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "postsSeen" INTEGER NOT NULL DEFAULT 0,
    "postsAccepted" INTEGER NOT NULL DEFAULT 0,
    "postsRejected" INTEGER NOT NULL DEFAULT 0,
    "vacanciesCreated" INTEGER NOT NULL DEFAULT 0,
    "vacanciesUpdated" INTEGER NOT NULL DEFAULT 0,
    "errorsCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ParserRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "vacancyId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "comment" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CityWaitlist" (
    "id" TEXT NOT NULL,
    "citySlug" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CityWaitlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeocodeCache" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "provider" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeocodeCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VacancyGroup" (
    "id" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "primaryVacancyId" TEXT NOT NULL,
    "postingsCount" INTEGER NOT NULL DEFAULT 1,
    "sourcesCount" INTEGER NOT NULL DEFAULT 1,
    "distinctPhonesCount" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VacancyGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactVerdict" (
    "id" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "verdict" "ContactVerdictKind" NOT NULL,
    "reason" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vacanciesCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ContactVerdict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationDecision" (
    "id" TEXT NOT NULL,
    "vacancyId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "triggeredRules" JSONB NOT NULL,
    "comment" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NormalizationSample" (
    "id" TEXT NOT NULL,
    "sourceText" TEXT NOT NULL,
    "expectedTitle" TEXT NOT NULL,
    "expectedSections" JSONB,
    "expectedFields" JSONB NOT NULL,
    "correctedBy" TEXT NOT NULL,
    "normalizerVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NormalizationSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "inputChars" INTEGER NOT NULL DEFAULT 0,
    "outputChars" INTEGER NOT NULL DEFAULT 0,
    "costEstimate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rejectedByCheck" INTEGER NOT NULL DEFAULT 0,
    "cacheHits" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiCache" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "type" "EventType" NOT NULL,
    "vacancyId" TEXT,
    "employerId" TEXT,
    "citySlug" TEXT NOT NULL,
    "districtSlug" TEXT,
    "sphere" TEXT,
    "professionSlug" TEXT,
    "queryText" VARCHAR(120),
    "sessionHash" TEXT NOT NULL,
    "deviceClass" "DeviceClass" NOT NULL,
    "qualityMode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatDaily" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "citySlug" TEXT NOT NULL,
    "sphere" TEXT NOT NULL,
    "professionSlug" TEXT NOT NULL,
    "vacanciesActive" INTEGER NOT NULL DEFAULT 0,
    "vacanciesNew" INTEGER NOT NULL DEFAULT 0,
    "vacanciesClosed" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "listViews" INTEGER NOT NULL DEFAULT 0,
    "searches" INTEGER NOT NULL DEFAULT 0,
    "applications" INTEGER NOT NULL DEFAULT 0,
    "favorites" INTEGER NOT NULL DEFAULT 0,
    "contactClicks" INTEGER NOT NULL DEFAULT 0,
    "salaryP25" INTEGER,
    "salaryP50" INTEGER,
    "salaryP75" INTEGER,
    "salaryCount" INTEGER NOT NULL DEFAULT 0,
    "noSalaryCount" INTEGER NOT NULL DEFAULT 0,
    "medianDaysToFirstApply" INTEGER,
    "medianLifetimeDays" INTEGER,

    CONSTRAINT "StatDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployerStatDaily" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "employerId" TEXT NOT NULL,
    "vacancyId" TEXT NOT NULL,
    "listViews" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "applications" INTEGER NOT NULL DEFAULT 0,
    "favorites" INTEGER NOT NULL DEFAULT 0,
    "contactClicks" INTEGER NOT NULL DEFAULT 0,
    "avgPositionInList" DOUBLE PRECISION,

    CONSTRAINT "EmployerStatDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketSnapshotMonthly" (
    "id" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "citySlug" TEXT NOT NULL,
    "sphere" TEXT NOT NULL,
    "professionSlug" TEXT NOT NULL,
    "salaryP25" INTEGER,
    "salaryP50" INTEGER,
    "salaryP75" INTEGER,
    "vacanciesCount" INTEGER NOT NULL DEFAULT 0,
    "deficitIndex" DOUBLE PRECISION,
    "competitionIndex" DOUBLE PRECISION,
    "noSalaryShare" DOUBLE PRECISION,
    "sampleSize" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MarketSnapshotMonthly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatsRun" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "eventsProcessed" INTEGER NOT NULL DEFAULT 0,
    "rowsWritten" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StatsRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchQueryStat" (
    "id" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "citySlug" TEXT NOT NULL,
    "queryNormalized" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "resultsAvgCount" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "SearchQueryStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Vacancy_slug_key" ON "Vacancy"("slug");

-- CreateIndex
CREATE INDEX "Vacancy_citySlug_idx" ON "Vacancy"("citySlug");

-- CreateIndex
CREATE INDEX "Vacancy_isActive_idx" ON "Vacancy"("isActive");

-- CreateIndex
CREATE INDEX "Vacancy_publishedAt_idx" ON "Vacancy"("publishedAt");

-- CreateIndex
CREATE INDEX "Vacancy_sphere_idx" ON "Vacancy"("sphere");

-- CreateIndex
CREATE INDEX "Vacancy_contentHash_idx" ON "Vacancy"("contentHash");

-- CreateIndex
CREATE INDEX "Vacancy_signature_idx" ON "Vacancy"("signature");

-- CreateIndex
CREATE INDEX "Vacancy_moderationStatus_idx" ON "Vacancy"("moderationStatus");

-- CreateIndex
CREATE INDEX "Vacancy_citySlug_isActive_workFormat_publishedAt_idx" ON "Vacancy"("citySlug", "isActive", "workFormat", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Vacancy_source_externalId_key" ON "Vacancy"("source", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Employer_slug_key" ON "Employer"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Profession_slug_key" ON "Profession"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Application_userId_vacancyId_key" ON "Application"("userId", "vacancyId");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_userId_vacancyId_key" ON "Favorite"("userId", "vacancyId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramUser_chatId_key" ON "TelegramUser"("chatId");

-- CreateIndex
CREATE INDEX "ParsedPost_status_createdAt_idx" ON "ParsedPost"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ParsedPost_source_externalId_key" ON "ParsedPost"("source", "externalId");

-- CreateIndex
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CityWaitlist_citySlug_idx" ON "CityWaitlist"("citySlug");

-- CreateIndex
CREATE UNIQUE INDEX "GeocodeCache_query_key" ON "GeocodeCache"("query");

-- CreateIndex
CREATE UNIQUE INDEX "VacancyGroup_signature_key" ON "VacancyGroup"("signature");

-- CreateIndex
CREATE UNIQUE INDEX "ContactVerdict_contact_key" ON "ContactVerdict"("contact");

-- CreateIndex
CREATE INDEX "ModerationDecision_vacancyId_decidedAt_idx" ON "ModerationDecision"("vacancyId", "decidedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiUsage_date_provider_model_taskType_key" ON "AiUsage"("date", "provider", "model", "taskType");

-- CreateIndex
CREATE UNIQUE INDEX "AiCache_key_key" ON "AiCache"("key");

-- CreateIndex
CREATE INDEX "Event_createdAt_idx" ON "Event"("createdAt");

-- CreateIndex
CREATE INDEX "Event_type_createdAt_idx" ON "Event"("type", "createdAt");

-- CreateIndex
CREATE INDEX "Event_citySlug_createdAt_idx" ON "Event"("citySlug", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StatDaily_date_citySlug_sphere_professionSlug_key" ON "StatDaily"("date", "citySlug", "sphere", "professionSlug");

-- CreateIndex
CREATE UNIQUE INDEX "EmployerStatDaily_date_employerId_vacancyId_key" ON "EmployerStatDaily"("date", "employerId", "vacancyId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketSnapshotMonthly_month_citySlug_sphere_professionSlug_key" ON "MarketSnapshotMonthly"("month", "citySlug", "sphere", "professionSlug");

-- CreateIndex
CREATE UNIQUE INDEX "SearchQueryStat_month_citySlug_queryNormalized_key" ON "SearchQueryStat"("month", "citySlug", "queryNormalized");

-- AddForeignKey
ALTER TABLE "Vacancy" ADD CONSTRAINT "Vacancy_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "Vacancy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vacancy" ADD CONSTRAINT "Vacancy_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "VacancyGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vacancy" ADD CONSTRAINT "Vacancy_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "Employer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VacancyGroup" ADD CONSTRAINT "VacancyGroup_primaryVacancyId_fkey" FOREIGN KEY ("primaryVacancyId") REFERENCES "Vacancy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationDecision" ADD CONSTRAINT "ModerationDecision_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "Employer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployerStatDaily" ADD CONSTRAINT "EmployerStatDaily_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "Employer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

