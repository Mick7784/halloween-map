import { readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function decodePng(png: Buffer) {
  expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  expect(png[24]).toBe(8); // 8-bit channels
  expect(png[25]).toBe(6); // RGBA: real alpha channel, not a CSS filter
  expect(png[28]).toBe(0); // non-interlaced

  const parts: Buffer[] = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT") parts.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
    if (type === "IEND") break;
  }
  const compressed = inflateSync(Buffer.concat(parts));
  const stride = width * 4;
  expect(compressed.byteLength).toBe((stride + 1) * height);
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    const start = y * (stride + 1);
    const filter = compressed[start];
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? pixels[row + x - 4] : 0;
      const above = y > 0 ? pixels[row - stride + x] : 0;
      const aboveLeft = y > 0 && x >= 4 ? pixels[row - stride + x - 4] : 0;
      let predictor: number;
      switch (filter) {
        case 0: predictor = 0; break;
        case 1: predictor = left; break;
        case 2: predictor = above; break;
        case 3: predictor = Math.floor((left + above) / 2); break;
        case 4: {
          const estimate = left + above - aboveLeft;
          const dl = Math.abs(estimate - left), da = Math.abs(estimate - above), dc = Math.abs(estimate - aboveLeft);
          predictor = dl <= da && dl <= dc ? left : da <= dc ? above : aboveLeft;
          break;
        }
        default: throw new Error(`Unsupported PNG filter ${filter}`);
      }
      pixels[row + x] = (compressed[start + x + 1] + predictor) & 255;
    }
  }
  return { width, height, alphaAt: (x: number, y: number) => pixels[(y * width + x) * 4 + 3] };
}

describe("Studio transparent official wordmark", () => {
  it("keeps artwork and served branding byte-for-byte identical, with genuine RGBA", async () => {
    const [original, served] = await Promise.all([
      readFile("artwork/branding/halloween-map-wordmark-transparent.png"),
      readFile("public/brand/halloween-map-wordmark-transparent.png"),
    ]);
    expect(original.equals(served)).toBe(true);
    const image = decodePng(served);
    expect(image.width).toBeGreaterThan(400);
    expect(image.height).toBeGreaterThan(150);

    // No matte at the edges, nor the former violet artefact to the lower-right.
    expect(image.alphaAt(0, 0)).toBe(0);
    expect(image.alphaAt(image.width - 1, image.height - 1)).toBe(0);
    expect(image.alphaAt(image.width - 15, Math.round(image.height * .8))).toBe(0);

    // White Halloween lettering and its source artwork are still visible.
    expect(image.alphaAt(25, 35)).toBeGreaterThan(240);
  });
});
