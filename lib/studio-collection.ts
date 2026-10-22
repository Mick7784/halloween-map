/**
 * Generic, pure collection engine adapted from the LinKs back-office.
 * No DOM, framework, API, permissions or Halloween Map business knowledge.
 * Consumers own filters beyond text search and supply their column comparator.
 */
export type StudioSortDirection = "asc" | "desc";
export type StudioCollectionOptions<T> = {
  query?: string;
  searchText?: (item: T) => string | readonly string[];
  compare?: (a: T, b: T) => number;
  direction?: StudioSortDirection;
  page?: number; // 1-based, as in Halloween Map's existing tables
  pageSize?: number;
};
export type StudioCollectionResult<T> = {
  rows: T[];
  total: number;
  pages: number;
  page: number;
};

export function selectStudioCollection<T>(
  source: readonly T[],
  {
    query = "",
    searchText,
    compare,
    direction = "asc",
    page = 1,
    pageSize = 25,
  }: StudioCollectionOptions<T> = {},
): StudioCollectionResult<T> {
  const needle = query.trim().toLocaleLowerCase("fr");
  const normalized = source
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => {
      if (!needle) return true;
      const fields = searchText?.(item) ?? "";
      const text = Array.isArray(fields) ? fields.join(" ") : String(fields);
      return text.toLocaleLowerCase("fr").includes(needle);
    });

  // Stable ordering is important for predictable pagination and React keys.
  // Never sort or otherwise mutate the caller's array.
  if (compare)
    normalized.sort(
      (a, b) =>
        (direction === "desc" ? -1 : 1) * compare(a.item, b.item) ||
        a.index - b.index,
    );

  const size =
    Number.isFinite(pageSize) && pageSize > 0
      ? Math.max(1, Math.trunc(pageSize))
      : 25;
  const total = normalized.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const requested = Number.isFinite(page) ? Math.max(1, Math.trunc(page)) : 1;
  const current = Math.min(requested, pages);

  return {
    rows: normalized
      .slice((current - 1) * size, current * size)
      .map(({ item }) => item),
    total,
    pages,
    page: current,
  };
}
