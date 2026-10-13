import { readFile, mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
const icon = await readFile("public/favicon.svg");
const background = "#080b18";
await mkdir("public/pwa", { recursive: true });
for (const size of [16, 32])
  await sharp(icon).resize(size, size).png().toFile(`public/favicon-${size}.png`);
for (const size of [192, 512])
  await sharp(icon)
    .resize(size, size)
    .png()
    .toFile(`public/pwa/icon-${size}.png`);
await sharp(icon)
  .resize(180, 180)
  .flatten({ background })
  .png()
  .toFile("public/pwa/apple-touch-icon.png");
// Opaque background and centered artwork for launcher masking.
const mask = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 128 128"><rect width="128" height="128" fill="${background}"/><svg x="16" y="16" width="96" height="96" viewBox="0 0 96 96">${icon.toString().replace(/<svg[^>]*>|<\/svg>/g, "")}</svg></svg>`;
for (const size of [192, 512])
  await sharp(Buffer.from(mask)).resize(size, size).png().toFile(`public/pwa/maskable-${size}.png`);
const version = (await readFile("VERSION", "utf8")).trim();
const sw = (await readFile("scripts/sw-template.js", "utf8")).replace(
  "__VERSION__",
  version,
);
await writeFile("public/sw.js", sw);
