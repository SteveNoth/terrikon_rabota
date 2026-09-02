import professionsJson from "@shared/professions.json";

export type ProfessionsFile = typeof professionsJson;
export type SphereJson = ProfessionsFile["spheres"][number];
export type ProfessionJson = ProfessionsFile["items"][number];

export type Sphere = {
  slug: string;
  name: string;
  /** Предложный падеж: «в строительстве». Для IT совпадает с name. */
  loc: string;
  icon: string;
};

export type Profession = {
  slug: string;
  name: string;
  sphere: string;
  synonyms: string[];
};

const SPHERES: Sphere[] = professionsJson.spheres.map((sphere) => ({
  slug: sphere.slug,
  name: sphere.name,
  loc: sphere.loc,
  icon: sphere.icon,
}));

const PROFESSIONS: Profession[] = professionsJson.items.map((item) => ({
  slug: item.slug,
  name: item.name,
  sphere: item.sphere,
  synonyms: [...item.synonyms],
}));

const SPHERES_BY_SLUG = new Map<string, Sphere>(SPHERES.map((item) => [item.slug, item]));
const PROFESSIONS_BY_SLUG = new Map<string, Profession>(
  PROFESSIONS.map((item) => [item.slug, item]),
);

export function getSphere(slug: string): Sphere | undefined {
  return SPHERES_BY_SLUG.get(slug);
}

export function listSpheres(): Sphere[] {
  return SPHERES;
}

export function getProfession(slug: string): Profession | undefined {
  return PROFESSIONS_BY_SLUG.get(slug);
}

export function listProfessionCatalog(): Profession[] {
  return PROFESSIONS;
}
