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

  it("serves a genuinely RGBA, transparent official wordmark variant", async () => {
    const [original, served] = await Promise.all([
      readFile("artwork/branding/halloween-map-wordmark-transparent.png"),
      readFile("public/brand/halloween-map-wordmark-transparent.png"),
    ]);
    expect(original.equals(served)).toBe(true);
    expect(original.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(true);
    expect(original.toString("ascii", 12, 16)).toBe("IHDR");
    // PNG IHDR color type 6 is RGBA, not an opaque RGB or indexed PNG.
    expect(original[25]).toBe(6);
    expect(original.byteLength).toBeGreaterThan(1000);
  });
});
