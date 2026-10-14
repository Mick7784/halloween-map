import { readFile, mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

// Two approved illustrations, deliberately separate so the favicon remains
// legible at 16/32px. Fail the build if either required source is missing:
// never silently ship an old icon under the new release number.
const appIcon = await readFile("public/pwa/app-icon-source.webp");
const favicon = await readFile("public/favicon-mini-source.webp");
const background = "#080b18";
await mkdir("public/pwa", { recursive: true });

for (const size of [16, 32])
  await sharp(favicon).resize(size, size).png().toFile(`public/favicon-${size}.png`);

for (const size of [192, 512])
  await sharp(appIcon).resize(size, size).png().toFile(`public/pwa/icon-${size}.png`);

await sharp(appIcon)
  .resize(180, 180)
  .flatten({ background })
  .png()
  .toFile("public/pwa/apple-touch-icon.png");

// Only the foreground inside the central 80% circular safe zone must survive
// Android's masks: 56% square art fits fully in that circle.
for (const size of [192, 512]) {
  const innerSize = Math.round(size * .56);
  const foreground = await sharp(appIcon).resize(innerSize, innerSize).png().toBuffer();
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background,
    },
  })
    .composite([{ input: foreground, gravity: "centre" }])
    .flatten({ background })
    .png()
    .toFile(`public/pwa/maskable-${size}.png`);
}
const version = (await readFile("VERSION", "utf8")).trim();
const sw = (await readFile("scripts/sw-template.js", "utf8")).replace(
  "__VERSION__",
  version,
);
await writeFile("public/sw.js", sw);
