import type { Prisma } from "@prisma/client";

export type DescriptionSections = {
  description: string;
  tasks: string[];
  requirements: string[];
  conditions: string[];
};

export function parseSections(value: Prisma.JsonValue | null | undefined): DescriptionSections {
  const empty: DescriptionSections = { description: "", tasks: [], requirements: [], conditions: [] };
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return empty;
  }
  const row = value as Record<string, unknown>;
  const list = (key: string): string[] => {
    const raw = row[key];
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
  };
  return {
    description: typeof row.description === "string" ? row.description : "",
    tasks: list("tasks"),
    requirements: list("requirements"),
    conditions: list("conditions"),
  };
}

export function sectionsFromForm(form: FormData): DescriptionSections {
  const lines = (name: string) =>
    String(form.get(name) ?? "")
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
  return {
    description: String(form.get("sectionDescription") ?? "").trim(),
    tasks: lines("sectionTasks"),
    requirements: lines("sectionRequirements"),
    conditions: lines("sectionConditions"),
  };
}

export function sectionsPayload(sections: DescriptionSections): Prisma.InputJsonValue | undefined {
  const payload: Record<string, unknown> = {};
  if (sections.description) {
    payload.description = sections.description.slice(0, 3000);
  }
  if (sections.tasks.length) {
    payload.tasks = sections.tasks.slice(0, 40);
  }
  if (sections.requirements.length) {
    payload.requirements = sections.requirements.slice(0, 40);
  }
  if (sections.conditions.length) {
    payload.conditions = sections.conditions.slice(0, 40);
  }
  if (Object.keys(payload).length === 0) {
    return undefined;
  }
  return payload as Prisma.InputJsonValue;
}
