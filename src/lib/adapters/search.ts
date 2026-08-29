/**
 * Переходник поиска (Закон 6).
 *
 * По умолчанию SEARCH_DRIVER=postgres. Полнотекст PostgreSQL подключим, когда
 * обычного `contains` в репозитории станет мало. Meilisearch — платная замена
 * за этим же интерфейсом, без правок страниц.
 *
 * Сейчас шов пустой: текстовый поиск списка живёт в `listVacancies`.
 */

export type SearchHit = {
  slug: string;
  score: number;
};

export type SearchOptions = {
  citySlug?: string;
  limit: number;
};

export interface SearchAdapter {
  searchVacancies(query: string, options: SearchOptions): Promise<SearchHit[]>;
}

class PostgresSearch implements SearchAdapter {
  async searchVacancies(query: string, options: SearchOptions): Promise<SearchHit[]> {
    void query;
    void options;
    return [];
  }
}

class MeilisearchSearch implements SearchAdapter {
  async searchVacancies(query: string, options: SearchOptions): Promise<SearchHit[]> {
    void query;
    void options;
    console.warn("SEARCH_DRIVER=meilisearch: клиент ещё не подключён, поиск пустой.");
    return [];
  }
}

function createSearch(): SearchAdapter {
  const driver = (process.env.SEARCH_DRIVER ?? "postgres").toLowerCase();
  if (driver === "meilisearch") {
    return new MeilisearchSearch();
  }
  return new PostgresSearch();
}

export const search = createSearch();
