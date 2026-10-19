import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Halloween Map official back-office branding", () => {
  it.each([
    "halloween-map-wordmark-official.webp",
    "halloween-map-app-icon-official.webp",
  ])("serves the exact official ecosystem asset %s", async (name) => {
    const [original, served] = await Promise.all([
      readFile("artwork/branding/" + name),
      readFile("public/brand/" + name),
    ]);
    expect(served.byteLength).toBeGreaterThan(0);
    expect(served.equals(original)).toBe(true);
    expect(served.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(served.subarray(8, 12).toString("ascii")).toBe("WEBP");
  });
});
