/**
 * Флаги очистки. Без --apply ничего не удаляем: --dry-run по умолчанию.
 */
export type CleanupMode = {
  dryRun: boolean;
  apply: boolean;
};

export function parseCleanupArgs(argv: string[]): CleanupMode {
  const flags = new Set(argv.filter((item) => item.startsWith("-")));
  if (flags.has("--apply") || flags.has("--execute")) {
    return { dryRun: false, apply: true };
  }
  return { dryRun: true, apply: false };
}

export function parseReportArgs(argv: string[]): CleanupMode {
  return parseCleanupArgs(argv);
}
