import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import manifest from "../app/manifest";

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
});
