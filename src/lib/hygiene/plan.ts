export type CleanupPlan = {
  deactivate: number;
  deleteVacancies: number;
  deleteParsedPosts: number;
  deleteParserRuns: number;
  geocodeCacheKept: number;
  totalDeletes: number;
};

export type CleanupResult = CleanupPlan & {
  dryRun: boolean;
  applied: boolean;
};
