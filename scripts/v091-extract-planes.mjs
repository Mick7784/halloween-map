/** Derive registered alpha planes. Every RGB pixel comes from ONE master.
 * Imagegen's foreground extraction supplies ALPHA ONLY: its altered RGB
 * pixels are never used. The middle-depth roofline is a canvas mask.
 * Run before v091-build-layers.mjs; no automatic changes during app builds.
 */
import sharp from "sharp";
import { writeFile } from "node:fs/promises";

const source = "artwork/v091";
const master = await sharp(`${source}/scene-mobile-desktop-master.png`)
  .removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height } = master.info;
const maskMeta = await sharp(`${source}/near-mask-source.png`).metadata();
if (maskMeta.width !== width || maskMeta.height !== height) {
  throw new Error("Foreground mask and master must share the same canvas");
}
const foreground = await sharp(`${source}/near-mask-source.png`)
  .ensureAlpha().extractChannel("alpha").raw().toBuffer();
// Authoring coordinates use the master canvas, never the viewport crop.
const middleSvg = `<svg width="${width}" height="${height}" viewBox="0 0 1536 1024" xmlns="http://www.w3.org/2000/svg">
  <path fill="white" d="M0 330 L130 270 L260 180 L345 265 L400 325 L425 245 L500 305 L570 355 L570 550 L670 650 L670 780 L0 820 Z"/>
  <path fill="white" d="M930 420 L1090 300 L1190 380 L1280 300 L1400 200 L1536 130 L1536 800 L860 800 L900 600 Z"/>
</svg>`;
await writeFile(`${source}/mid-mask.svg`, middleSvg + "\n");
const middle = await sharp(Buffer.from(middleSvg))
  .ensureAlpha().extractChannel("alpha").raw().toBuffer();
const names = ["far", "mid", "near"];
const planes = names.map(() => Buffer.alloc(width * height * 4));
const coverage = [0, 0, 0];
for (let i = 0; i < width * height; i++) {
  // Disjoint binary ownership avoids translucent overlaps and guarantees
  // exact reconstruction at rest. No generated RGB, resizing or repainting.
  const owner = foreground[i] >= 128 ? 2 : middle[i] >= 128 ? 1 : 0;
  const plane = planes[owner];
  plane[i * 4] = master.data[i * 3];
  plane[i * 4 + 1] = master.data[i * 3 + 1];
  plane[i * 4 + 2] = master.data[i * 3 + 2];
  plane[i * 4 + 3] = 255;
  coverage[owner]++;
}
for (const [index, name] of names.entries()) {
  await sharp(planes[index], { raw: { width, height, channels: 4 } })
    .png().toFile(`${source}/plane-${name}.png`);
}
console.log(JSON.stringify({ width, height, pixelsRepainted: 0,
  alphaCoverage: Object.fromEntries(names.map((name, i) => [name, coverage[i] / (width * height)])),
}, null, 2));
