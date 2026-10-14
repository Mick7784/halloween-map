import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import manifest from "../app/manifest";

it("generates the app and mini favicon from the two distinct approved sources", async () => {
  const appSource = await readFile("public/pwa/app-icon-source.webp");
  const miniSource = await readFile("public/favicon-mini-source.webp");
  expect(appSource.equals(miniSource)).toBe(false);
  expect((await sharp(appSource).metadata()).width).toBeGreaterThanOrEqual(256);
  expect((await sharp(miniSource).metadata()).width).toBeGreaterThanOrEqual(256);
  for (const size of [16, 32]) {
    const expected = await sharp(miniSource).resize(size, size).png().toBuffer();
    const actual = await readFile(`public/favicon-${size}.png`);
    expect(actual.equals(expected)).toBe(true);
  }
  for (const size of [192, 512]) {
    const expected = await sharp(appSource).resize(size, size).png().toBuffer();
    const actual = await readFile(`public/pwa/icon-${size}.png`);
    expect(actual.equals(expected)).toBe(true);
  }
});

it("declares real icon sizes and opaque maskable/iOS exports with safe foreground", async () => {
  const identity = manifest();
  expect(identity.id).toBe("/");
  expect(identity.scope).toBe("/");
  expect(identity.start_url).toBe("/");
  expect(identity.theme_color).toBe("#080b18");
  expect(identity.description).toContain("outil individuel");
  for (const icon of identity.icons ?? []) {
    const size = Number(icon.sizes!.split("x")[0]);
    const { data, info } = await sharp(`public${icon.src}`).ensureAlpha()
      .raw().toBuffer({ resolveWithObject: true });
    expect(info.width).toBe(size);
    expect(info.height).toBe(size);
    if (icon.purpose !== "maskable") continue;
    let transparent = 0;
    let outsideSafeZone = 0;
    for (let i = 0; i < size * size; i++) {
      if (data[i * 4 + 3] !== 255) transparent++;
      // Amber pumpkin details must survive circular or rounded launcher masks.
      if (data[i * 4] > 180 && data[i * 4 + 1] > 65 && data[i * 4 + 2] < 150) {
        const radius = Math.hypot(i % size + .5 - size / 2, Math.floor(i / size) + .5 - size / 2);
        if (radius > size * .4) outsideSafeZone++;
      }
    }
    expect(transparent).toBe(0);
    expect(outsideSafeZone).toBe(0);
  }
  const apple = await sharp("public/pwa/apple-touch-icon.png").metadata();
  expect(apple.width).toBe(180);
  expect(apple.height).toBe(180);
  expect(apple.hasAlpha).toBe(false);
  for (const size of [16, 32]) {
    const png = await readFile(`public/favicon-${size}.png`);
    expect(png.readUInt32BE(16)).toBe(size);
    expect(png.readUInt32BE(20)).toBe(size);
  }
  const ico = await readFile("public/favicon.ico");
  expect(ico.readUInt16LE(0)).toBe(0);
  expect(ico.readUInt16LE(2)).toBe(1);
  expect(ico.readUInt16LE(4)).toBe(2);
  for (const [index, size] of [16, 32].entries()) {
    const entry = 6 + index * 16;
    expect(ico.readUInt8(entry)).toBe(size);
    expect(ico.readUInt8(entry + 1)).toBe(size);
    const length = ico.readUInt32LE(entry + 8);
    const offset = ico.readUInt32LE(entry + 12);
    const content = ico.subarray(offset, offset + length);
    expect(content.equals(await readFile(`public/favicon-${size}.png`))).toBe(true);
  }
});
