import { describe, expect, it } from "vitest";
import { selectStudioCollection } from "../lib/studio-collection";

type Row = { id: string; name: string; details: string[]; count: number };
const rows: readonly Row[] = [
  { id: "a", name: "Balade", details: ["Crécy"], count: 2 },
  { id: "b", name: "Maison", details: ["Ferrières"], count: 7 },
  { id: "c", name: "Maison", details: ["Bussy"], count: 7 },
  { id: "d", name: "Jardin", details: ["Crécy"], count: 3 },
];

describe("DomotiK Studio reusable collection selection", () => {
  it("searches the app-provided fields in French without knowing the domain", () => {
    const matching = selectStudioCollection(rows, {
      query: "  CRÉCY  ",
      searchText: (row) => [row.name, ...row.details],
    });
    expect(matching.rows.map((r) => r.id)).toEqual(["a", "d"]);
    expect(matching.total).toBe(2);
    expect(matching.pages).toBe(1);
  });

  it("keeps source and tied row order unchanged while sorting descending", () => {
    const initial = rows.map((r) => r.id);
    const output = selectStudioCollection(rows, {
      compare: (a, b) => a.count - b.count,
      direction: "desc",
    });
    expect(output.rows.map((r) => r.id)).toEqual(["b", "c", "d", "a"]);
    expect(rows.map((r) => r.id)).toEqual(initial);
  });

  it("uses 1-based pagination and clamps the page when a filter shortens results", () => {
    const all = selectStudioCollection(rows, { page: 2, pageSize: 2 });
    expect(all).toMatchObject({ page: 2, total: 4, pages: 2 });
    expect(all.rows.map((r) => r.id)).toEqual(["c", "d"]);

    const filtered = selectStudioCollection(rows, {
      query: "maison",
      searchText: (r) => r.name,
      page: 50,
      pageSize: 1,
    });
    expect(filtered).toMatchObject({ total: 2, pages: 2, page: 2 });
    expect(filtered.rows.map((r) => r.id)).toEqual(["c"]);
  });

  it("handles empty results and invalid pagination without empty intermediate pages", () => {
    expect(
      selectStudioCollection(rows, {
        query: "introuvable",
        searchText: (r) => r.name,
        page: 99,
      }),
    ).toEqual({ rows: [], total: 0, pages: 1, page: 1 });
    expect(
      selectStudioCollection(rows, { page: Number.NaN, pageSize: 0 }),
    ).toMatchObject({ total: 4, pages: 1, page: 1 });
  });

  it("keeps filtering, ordering and paging independent of one another", () => {
    const result = selectStudioCollection(rows, {
      query: "maison",
      searchText: (r) => r.name,
      compare: (a, b) => a.details[0].localeCompare(b.details[0], "fr"),
      page: 1,
      pageSize: 1,
    });
    expect(result.rows.map((r) => r.id)).toEqual(["c"]);
    expect(result).toMatchObject({ total: 2, pages: 2, page: 1 });
  });
});
