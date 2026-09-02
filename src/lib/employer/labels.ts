import { ApplicationStatus } from "@prisma/client";

export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  SENT: "новый",
  VIEWED: "просмотрен",
  INVITED: "приглашён",
  REJECTED: "отказ",
};

export const APPLICATION_STATUS_OPTIONS: { value: ApplicationStatus; label: string }[] = [
  { value: "VIEWED", label: "просмотрен" },
  { value: "INVITED", label: "приглашён" },
  { value: "REJECTED", label: "отказ" },
];
