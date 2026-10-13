import { expect, it } from "vitest";
import sharp from "sharp";
import { stat } from "node:fs/promises";

it("depth exports reconstruct the shared master with unaltered RGB and one alpha owner per pixel", async () => {
  const { data: master, info } = await sharp("artwork/v091/scene-mobile-desktop-master.png")
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const planes = await Promise.all(["far", "mid", "near"].map(async (name) => {
    const path = `public/art/home-v091-${name}.webp`;
    const result = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(result.info.width).toBe(info.width);
    expect(result.info.height).toBe(info.height);
    return result.data;
  }));
  let ownershipErrors = 0;
  let alteredPixels = 0;
  for (let i = 0; i < info.width * info.height; i++) {
    let owners = 0;
    for (const plane of planes) {
      const alpha = plane[i * 4 + 3];
      if (!alpha) continue;
      owners++;
      if (alpha !== 255) ownershipErrors++;
      if ([0, 1, 2].some((c) => plane[i * 4 + c] !== master[i * 3 + c])) alteredPixels++;
    }
    if (owners !== 1) ownershipErrors++;
  }
  expect(ownershipErrors).toBe(0);
  expect(alteredPixels).toBe(0);
  const sizes = await Promise.all(["shared", "far", "mid", "near"].map(
    async (name) => (await stat(`public/art/home-v091-${name}.webp`)).size,
  ));
  expect(sizes.reduce((total, bytes) => total + bytes, 0)).toBeLessThan(3_600_000);
});
