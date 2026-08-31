import { z } from "zod";
import { getAllCities, getCity, getDistricts, isCitySlug, publishOnlyActiveMessage } from "@/lib/geo";
import { getProfession, getSphere, listSpheres } from "@/lib/professions";
import { MAX_DESCRIPTION_CHARS } from "@/lib/parser/limits";

const EMAIL = z
  .string({ required_error: "Укажите email" })
  .trim()
  .min(1, "Укажите email")
  .email("Некорректный email")
  .max(120, "Email слишком длинный");

const PASSWORD = z
  .string({ required_error: "Укажите пароль" })
  .min(8, "Пароль слишком короткий. Минимум 8 символов")
  .max(72, "Пароль слишком длинный");

const NAME = z
  .string({ required_error: "Укажите имя" })
  .trim()
  .min(2, "Имя слишком короткое")
  .max(80, "Имя слишком длинное");

export const registerSchema = z.object({
  email: EMAIL,
  password: PASSWORD,
  name: NAME,
  role: z.enum(["SEEKER", "EMPLOYER"], {
    required_error: "Выберите, вы ищете работу или размещаете вакансии",
    invalid_type_error: "Выберите, вы ищете работу или размещаете вакансии",
  }),
  citySlug: z.string().trim().min(1, "Выберите город"),
  next: z.string().optional(),
});

export const loginSchema = z.object({
  email: EMAIL,
  password: z.string({ required_error: "Укажите пароль" }).min(1, "Укажите пароль"),
  next: z.string().optional(),
});

export const forgotSchema = z.object({
  email: EMAIL,
});

export const resetPasswordSchema = z
  .object({
    password: PASSWORD,
    passwordRepeat: z.string().min(1, "Повторите пароль"),
  })
  .superRefine((value, ctx) => {
    if (value.password !== value.passwordRepeat) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["passwordRepeat"],
        message: "Пароли не совпадают",
      });
    }
  });

const optionalUrl = z
  .string()
  .trim()
  .max(2000, "Ссылка слишком длинная")
  .optional()
  .transform((value) => value || "")
  .refine((value) => !value || /^https?:\/\//i.test(value), {
    message: "Ссылка должна начинаться с http:// или https://",
  });

export const companyProfileSchema = z.object({
  name: z.string().trim().min(2, "Укажите название компании").max(120, "Название слишком длинное"),
  description: z.string().trim().max(3000, "Описание не длиннее 3000 символов").optional().default(""),
  citySlug: z.string().trim().min(1, "Выберите город"),
  sphere: z.string().trim().min(1, "Выберите сферу"),
  phone: z.string().trim().max(32, "Телефон слишком длинный").optional().default(""),
  telegram: z.string().trim().max(64, "Telegram слишком длинный").optional().default(""),
  email: z
    .string()
    .trim()
    .max(120, "Email слишком длинный")
    .optional()
    .default("")
    .refine((value) => !value || z.string().email().safeParse(value).success, {
      message: "Некорректный email",
    }),
  website: optionalUrl,
  logoUrl: optionalUrl,
});

const optionalInt = z
  .string()
  .trim()
  .optional()
  .transform((value) => {
    if (!value) {
      return null;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  })
  .refine((value) => value === null || (Number.isInteger(value) && value >= 0 && value <= 10_000_000), {
    message: "Укажите целое неотрицательное число",
  });

export const employerVacancySchema = z.object({
  title: z.string().trim().min(3, "Укажите название вакансии").max(200, "Название слишком длинное"),
  description: z
    .string()
    .trim()
    .min(10, "Опишите вакансию хотя бы в двух предложениях")
    .max(MAX_DESCRIPTION_CHARS, `Описание не длиннее ${MAX_DESCRIPTION_CHARS} символов`),
  citySlug: z.string().trim().min(1, "Выберите город"),
  districtSlug: z.string().trim().optional().default(""),
  address: z.string().trim().max(200, "Адрес слишком длинный").optional().default(""),
  sphere: z.string().trim().min(1, "Выберите сферу"),
  professionSlug: z.string().trim().optional().default(""),
  salaryFrom: optionalInt,
  salaryTo: optionalInt,
  salaryPeriod: z.enum(["MONTH", "SHIFT", "HOUR", "PIECE"]).default("MONTH"),
  workFormat: z.enum(["LOCAL", "VAHTA", "REMOTE"]).default("LOCAL"),
  workLocationText: z.string().trim().max(200).optional().default(""),
  rotationPattern: z.string().trim().max(40).optional().default(""),
  vahtaDays: optionalInt,
  housingProvided: z.boolean().default(false),
  mealsProvided: z.boolean().default(false),
  travelPaid: z.boolean().default(false),
  schedule: z.string().trim().max(40).optional().default(""),
  experience: z.enum(["NONE", "UP_TO_1", "FROM_1_TO_3", "FROM_3", ""]).optional().default(""),
  employmentType: z.enum(["FULL", "PART", "SHIFT", "TEMPORARY", "REMOTE", ""]).optional().default(""),
  contactPhone: z.string().trim().max(32).optional().default(""),
  contactTelegram: z.string().trim().max(64).optional().default(""),
  contactEmail: z
    .string()
    .trim()
    .max(120)
    .optional()
    .default("")
    .refine((value) => !value || z.string().email().safeParse(value).success, {
      message: "Некорректный email для связи",
    }),
});

export function cityMustBeKnown(slug: string): string | null {
  if (!isCitySlug(slug) || !getCity(slug)) {
    return "Выберите город из списка";
  }
  return null;
}

export function cityMustBeActive(slug: string): string | null {
  const known = cityMustBeKnown(slug);
  if (known) {
    return known;
  }
  const city = getCity(slug);
  if (city?.status !== "active") {
    return publishOnlyActiveMessage();
  }
  return null;
}

export function districtMustMatchCity(citySlug: string, districtSlug: string): string | null {
  if (!districtSlug) {
    return null;
  }
  const districts = getDistricts(citySlug);
  if (!districts.some((item) => item.slug === districtSlug)) {
    return "Район не относится к выбранному городу";
  }
  return null;
}

export function sphereMustBeKnown(slug: string): string | null {
  if (slug === "unknown") {
    return null;
  }
  if (!getSphere(slug) && !listSpheres().some((item) => item.slug === slug)) {
    return "Выберите сферу из списка";
  }
  return null;
}

export function professionMustBeKnown(slug: string): string | null {
  if (!slug) {
    return null;
  }
  if (!getProfession(slug)) {
    return "Выберите профессию из списка";
  }
  return null;
}

export function firstZodMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Проверьте форму";
}

export function citySelectOptions(): { slug: string; label: string }[] {
  return getAllCities().map((city) => {
    const extra =
      city.status === "active" ? "" : city.status === "soon" ? " · скоро" : " · в планах";
    return { slug: city.slug, label: `${city.name.nom}${extra}` };
  });
}

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CompanyProfileInput = z.infer<typeof companyProfileSchema>;
export type EmployerVacancyInput = z.infer<typeof employerVacancySchema>;
