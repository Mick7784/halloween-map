import { readFile, mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
const icon = await readFile("public/favicon.svg");
await mkdir("public/pwa", { recursive: true });
for (const size of [192, 512])
  await sharp(icon)
    .resize(size, size)
    .png()
    .toFile(`public/pwa/icon-${size}.png`);
await sharp(icon)
  .resize(180, 180)
  .png()
  .toFile("public/pwa/apple-touch-icon.png");
const mask = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 128 128"><rect width="128" height="128" fill="#17171e"/><g transform="translate(16 16)">${icon.toString().replace(/<svg[^>]*>|<\/svg>/g, "")}</g></svg>`;
await sharp(Buffer.from(mask)).png().toFile("public/pwa/maskable-512.png");
const version = (await readFile("VERSION", "utf8")).trim();
const sw = (await readFile("scripts/sw-template.js", "utf8")).replace(
  "__VERSION__",
  version,
);
await writeFile("public/sw.js", sw);
